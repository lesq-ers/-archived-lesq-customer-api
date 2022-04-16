const { DynamoDB } = require("aws-sdk");

const dynamoDbClientParams = {};
if (process.env.IS_OFFLINE) {
    dynamoDbClientParams.region = 'local'
    dynamoDbClientParams.endpoint = 'http://localhost:8000'
}
const db = new DynamoDB(dynamoDbClientParams);
const TableName = process.env.LESQ_TABLE;

module.exports.handler = async (event, context) => {
    const { merchantId, productId } = event.pathParameters;
    console.log({ merchantId, productId });

    const result = await db.getItem({
        TableName,
        Key: {
            "PK": { S: `MERCHANT#${merchantId}` },
            "SK": { S: `PRODUCT#${productId.padStart(7, '0')}` }
        }
    }).promise();

    if (!result.Item) {
        return {
            statusCode: 404,
            body: JSON.stringify({ message: 'Product not found.' })
        };
    }

    const product = {
        id: result.Item.id.S,
        name: result.Item.name.S,
        description: result.Item.description.S,
        basePrice: result.Item.basePrice.N
    };

    return {
        statusCode: 200,
        body: JSON.stringify({ product })
    };
};