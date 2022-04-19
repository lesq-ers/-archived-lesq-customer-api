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


app.get("/api/merchants/:merchantId/menu", async (request, response) => {
    const { merchantId } = request.params;

    try {
        const menuQueryResults = await retrieveMenuItems(merchantId);
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

        const menu = { categories, products };
        response.json(menu)
    } catch (error) {
        response.status(500).json({ error });
        console.log("Error: ", error);
    }
});

app.get("/api/merchants/:merchantId/menu/:menuId", async (request, response) => {
    const { merchantId, menuId } = request.params;
    console.log({ merchantId, menuId });

    response.json({ merchantId, menuId });
});

const retrieveMenuItems = async (merchantId) => {
    const merchantKey = `MERCHANT#${merchantId.padStart(6, '0')}`;

    const menuDbResults = await db.query({
        TableName,
        IndexName: MenuIndexName,
        KeyConditionExpression: "MenuPK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `${merchantKey}|MENU#live` } }
    }).promise();

    const RequestItems = {
        [TableName]: {
            Keys: menuDbResults.Items.map((e) => {
                return { "PK": { S: merchantKey }, "SK": e.SK }
            })
        }
    };
    const menuItemDbResults = await db.batchGetItem({ RequestItems }).promise();
    return menuItemDbResults.Responses[TableName]
}

module.exports.handler = serverless(app);
