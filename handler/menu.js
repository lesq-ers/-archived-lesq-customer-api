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
const TRANSACTION_BATCH_SIZE = 10

app.get("/api/merchants/:merchantId/menu", async (request, response) => {
    const { merchantId } = request.params;

    try {
        const menu = await fetchMerchantCurrentMenu(merchantId);;
        response.json(menu)
    } catch (error) {
        response.status(500).json({ error });
    }
});

app.get("/api/merchants/:merchantId/menu/:menuId", async (request, response) => {
    const { merchantId, menuId } = request.params;
    try {
        const menu = await fetchMerchantMenuById(merchantId, menuId);
        response.json(menu)
    } catch (error) {
        response.status(500).json({ error });
    }
});


app.post("/api/merchants/:merchantId/menu/:menuId/live", async (request, response) => {
    const { merchantId, menuId } = request.params;

    try {
        await unsetMerchantLiveMenu(merchantId)
        await setMerchantLiveMenu(merchantId, menuId);
        const menu = await fetchMerchantCurrentMenu(merchantId);;
        response.json(menu)
    } catch (error) {
        response.status(500).json({ error });
    }

});

const buildMerchantKey = (merchantId) => {
    return `MERCHANT#${merchantId.padStart(7, '0')}`;
};

const buildMenuKey = (menuId) => {
    return `MENU#${menuId.padStart(7, '0')}`;
};

const fetchMerchantCurrentMenu = async (merchantId) => {
    const merchantKey = buildMerchantKey(merchantId);

    const menuDbResults = await db.query({
        TableName,
        IndexName: MenuIndexName,
        KeyConditionExpression: "MenuPK = :pk",
        ExpressionAttributeValues: {
            ":pk": { S: `${merchantKey}|${LiveMenuKey}` },
        }
    }).promise();

    if (menuDbResults.Count === 0) {
        throw new LiveMenuNotFoundError({ merchantId });
    }

    return await assembleMenu(merchantId, menuDbResults);
};

const fetchMerchantMenuById = async (merchantId, menuId) => {
    const merchantKey = buildMerchantKey(merchantId);
    const menuKey = buildMenuKey(menuId);

    const menuDbResults = await db.query({
        TableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `${merchantKey}|${menuKey}` } }
    }).promise();

    if (menuDbResults.Count === 0) {
        throw new MenuNotFoundError({ merchantId, menuId });
    }

    return await assembleMenu(merchantId, menuDbResults);
};

const assembleMenu = async (merchantId, menuRecords) => {
    const merchantKey = buildMerchantKey(merchantId);

    const metadataItem = menuRecords.Items.find((e) => e.SK.S == "#METADATA");
    const metadata = {
        note: metadataItem["notes"].S,
        description: metadataItem["description"].S,
        dateCreated: metadataItem["dateCreated"].S,
        lastUpdated: metadataItem["lastUpdated"].S
    };

    const menuItemKeys = menuRecords.Items;
    const RequestItems = {
        [TableName]: {
            Keys: menuItemKeys.map((e) => {
                return { "PK": { S: merchantKey }, "SK": e.SK }
            })
        }
    };
    const menuItemDbResults = await db.batchGetItem({ RequestItems }).promise();
    const menuQueryResults = menuItemDbResults.Responses[TableName]
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

    return { ...metadata, categories, products };
};

const unsetMerchantLiveMenu = async (merchantId) => {
    const merchantKey = buildMerchantKey(merchantId);

    const currentMenuDbResults = await db.query({
        TableName,
        IndexName: MenuIndexName,
        KeyConditionExpression: "MenuPK = :pk",
        ExpressionAttributeValues: {
            ":pk": { S: `${merchantKey}|${LiveMenuKey}` }
        }
    }).promise();

    if (currentMenuDbResults.Count > 0) {
        for (let i = 0; i < currentMenuDbResults.Count; i += TRANSACTION_BATCH_SIZE) {
            const endIndex = i + TRANSACTION_BATCH_SIZE;
            const TransactItems = currentMenuDbResults.Items.slice(i, endIndex)
                .map((item) => {
                    return {
                        Update: {
                            Key: {
                                "PK": item.PK,
                                "SK": item.SK
                            },
                            TableName,
                            UpdateExpression: "REMOVE MenuPK",
                        }
                    };
                });

            const transactWriteItems = await db.transactWriteItems({
                TransactItems,
                ReturnConsumedCapacity: "TOTAL"
            }).promise();
        }
    } else {
        console.warn("No live menu set for merchant: ", merchantId);
    }
};

const setMerchantLiveMenu = async (merchantId, menuId) => {
    const merchantKey = buildMerchantKey(merchantId);
    const menuKey = buildMenuKey(menuId);

    await db.updateItem({
        TableName,
        Key: {
            "PK": { S: merchantKey },
            "SK": { S: `#${menuKey}` }
        },
        UpdateExpression: "SET MenuPK = :menuPk",
        ExpressionAttributeValues: { ":menuPk": { S: `${merchantKey}|${LiveMenuKey}` } }
    }).promise();

    const newLiveMenuDbResults = await db.query({
        TableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `${merchantKey}|${menuKey}` } },
        ReturnConsumedCapacity: "TOTAL"
    }).promise();

    if (newLiveMenuDbResults.Count > 0) {
        for (let i = 0; i < newLiveMenuDbResults.Count; i += TRANSACTION_BATCH_SIZE) {
            const endIndex = i + TRANSACTION_BATCH_SIZE;
            const TransactItems = newLiveMenuDbResults.Items.slice(i, endIndex)
                .map((item) => {
                    return {
                        Update: {
                            Key: {
                                "PK": item.PK,
                                "SK": item.SK
                            },
                            TableName,
                            UpdateExpression: "SET MenuPK = :menuPk",
                            ExpressionAttributeValues: { ":menuPk": { S: `${merchantKey}|${LiveMenuKey}` } },
                        }
                    };
                });

            await db.transactWriteItems({
                TransactItems,
                ReturnConsumedCapacity: "TOTAL"
            }).promise();
        }
    } else {
        throw new MenuNotFoundError({ merchantId, menuId });
    }
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
        this.message = `Menu ${args.merchantId} not found for merchant ${args.menuId}.`
        this.merchantId = args.merchantId;
        this.menuId = args.menuId;
    }
}

module.exports.handler = serverless(app);
