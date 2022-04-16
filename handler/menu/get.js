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


app.get("/api/merchants/:merchantId/menu", async (request, response) => {
    const { merchantId } = request.params;

    try {
        const dbResult = await db.query({
            TableName,
            KeyConditionExpression: "PK = :pk",
            ExpressionAttributeValues: {
                ":pk": { S: `MERCHANT#${merchantId}|MENU#live` }
            }
        }).promise();

        const categories = dbResult.Items
            .filter((e) => e.SK.S.startsWith("CATEGORY#"))
            .map((e) => {
                return {
                    id: e.id.S,
                    name: e.name.S
                };
            });

        const products = dbResult.Items
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
        console.log("Error: ", error);
    }
});

module.exports.handler = serverless(app);
