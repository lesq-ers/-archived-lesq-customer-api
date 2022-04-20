const { DynamoDB } = require("aws-sdk");
const express = require("express");
const serverless = require("serverless-http");

const app = express();
app.use(express.json());

const dynamoDbClientParams = {};
if (process.env.IS_OFFLINE) {
    dynamoDbClientParams.region = 'local'
    dynamoDbClientParams.endpoint = 'http://localhost:8000'
}

const db = new DynamoDB(dynamoDbClientParams);
const TableName = process.env.LESQ_TABLE;
const MenuIndexName = 'MenuIndex'
const LiveMenuKey = 'MENU#live';

app.get("/api/merchants/:merchantId/menu", async (request, response) => {
    const { merchantId } = request.params;

    try {
        const menuQueryResults = await fetchMerchantCurrentMenu(merchantId);
        const menu = assembleMenu(menuQueryResults);
        response.json(menu)
    } catch (error) {
        response.status(500).json({ error });
        console.log("Error: ", error);
    }
});

app.get("/api/merchants/:merchantId/menu/:menuId", async (request, response) => {
    const { merchantId, menuId } = request.params;
    try {
        const menuQueryResults = await fetchMerchantMenuById(merchantId, menuId);
        const menu = assembleMenu(menuQueryResults);
        response.json(menu)
    } catch (error) {
        response.status(500).json({ error });
        console.log("Error: ", error);
    }
});


const fetchMerchantCurrentMenu = async (merchantId) => {
    const merchantKey = `MERCHANT#${merchantId.padStart(6, '0')}`;

    const menuDbResults = await db.query({
        TableName,
        IndexName: MenuIndexName,
        KeyConditionExpression: "MenuPK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `${merchantKey}|${LiveMenuKey}` } }
    }).promise();
    console.log("MENU DB RESULTS:", menuDbResults);

    if (menuDbResults.Count === 0) {
        throw new LiveMenuNotFoundError({ merchantId });
    }

    return retrieveMenuItemDetails(merchantKey, menuDbResults.Items)
};

const fetchMerchantMenuById = async (merchantId, menuId) => {
    const merchantKey = `MERCHANT#${merchantId.padStart(6, '0')}`;
    const menuKey = `MENU#${menuId.padStart(7, '0')}`

    const menuDbResults = await db.query({
        TableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `${merchantKey}|${menuKey}` } }
    }).promise();

    if (menuDbResults.Count === 0) {
        throw new MenuNotFoundError({ merchantId, menuId });
    }

    return retrieveMenuItemDetails(merchantKey, menuDbResults.Items)
};

const retrieveMenuItemDetails = async (merchantKey, menuItemKeys) => {
    const RequestItems = {
        [TableName]: {
            Keys: menuItemKeys.map((e) => {
                return { "PK": { S: merchantKey }, "SK": e.SK }
            })
        }
    };
    const menuItemDbResults = await db.batchGetItem({ RequestItems }).promise();
    return menuItemDbResults.Responses[TableName]
};

const assembleMenu = (menuQueryResults) => {
    const categories = menuQueryResults
        .filter((e) => e.SK.S.startsWith("CATEGORY#"))
        .map((e) => {
            return {
                id: e.id.S,
                name: e.name.S
            };
        });

    const products = menuQueryResults
        .filter((e) => e.SK.S.startsWith("PRODUCT#"))
        .map((e) => {
            return {
                id: e.id.S,
                name: e.name.S,
                description: e.description.S,
                categoryId: e.categoryId.S,
                basePrice: e.basePrice.N
            };
        });

    return { categories, products };
};


class LiveMenuNotFoundError extends Error {
    constructor(args) {
        super();
        this.name = 'MenuNotFoundError'
        this.message = 'Live menu for merchant was not found.'
        this.merchantId = args.merchantId;
    }
}

class MenuNotFoundError extends Error {
    constructor(args) {
        super();
        this.name = 'MenuNotFoundError'
        this.message = 'Menu not found.'
        this.merchantId = args.merchantId;
        this.menuId = args.menuId;
    }
}

module.exports.handler = serverless(app);
