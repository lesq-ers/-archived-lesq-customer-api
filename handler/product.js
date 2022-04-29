const express = require("express");
const serverless = require("serverless-http");
const { DynamoDB } = require("aws-sdk");

const app = express();
app.use(express.json());

const dynamoDbClientParams = {};
if (process.env.IS_OFFLINE) {
    dynamoDbClientParams.region = 'local'
    dynamoDbClientParams.endpoint = 'http://localhost:8000'
}
console.log("dynamoDbClientParams", dynamoDbClientParams);
// console.log("DynamoDB", DynamoDB);

const db = new DynamoDB(dynamoDbClientParams);
const TableName = process.env.LESQ_TABLE;


app.get('/api/merchants/:merchantId/products/:productId', async (request, response) => {

    const { merchantId, productId } = request.params;

    // {
    //     "PK": "MERCHANT#0000001",
    //     "SK": "PRODUCT#0000001",
    //     "name": "Caffe Americano",
    //     "description": "Rich espresso shots with hot water",
    //     "id": "1",
    //     "categoryId": "1",
    //     "basePrice": 155
    // },
    // {
    //     "PK": "MERCHANT#0000001",
    //     "SK": "PRODUCT#0000001|ADDONS#000001",
    //     "name": "Size",
    //     "label": "Choose your size:",
    //     "meta": {...}
    // },
    const productDbResults = await db.query({
        TableName,
        KeyConditionExpression: "(PK = :pk) AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
            ":pk": { S: buildMerchantKey(merchantId) },
            ":sk": { S: buildProductKey(productId) }
        }
    }).promise();

    if (productDbResults.Count === 0) {
        response.status(404);
        return;
    }
    // console.log("RESULTS:", productDbResults);

    // console.log("Product Item:", productDbResults.Items
    //     .filter((e) => e.SK.S == buildProductKey(productId)));
    const product = productDbResults.Items
        .filter((e) => e.SK.S == buildProductKey(productId))
        .map((e) => {
            return {
                id: e.id.S,
                name: e.name.S,
                description: e.description.S,
                basePrice: e.basePrice.N
            }
        })[0];
    console.log("Product", product);

    const productAddOnItems = productDbResults.Items
        .filter((e) => e.SK.S.startsWith(`${buildProductKey(productId)}|ADDON`));
    console.log("productAddOnItems", productAddOnItems);

    const addOns = productAddOnItems.map((e) => {
        return {
            name: e.name.S,
            label: e.label.S,
            metadata: e.meta.M
        };
    })
    product["addOns"] = addOns;
    console.log("addOns", addOns);


    response.json(product);
});


const buildMerchantKey = (merchantId) => {
    return `MERCHANT#${merchantId.padStart(7, '0')}`;
}

const buildProductKey = (productId) => {
    return `PRODUCT#${productId.padStart(7, '0')}`;
}

module.exports.handler = serverless(app);