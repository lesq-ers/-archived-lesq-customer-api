// const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDB } = require("aws-sdk");

const dynamoDbClientParams = {};
if (process.env.IS_OFFLINE) {
    dynamoDbClientParams.region = 'local'
    dynamoDbClientParams.endpoint = 'http://localhost:8000'
}
const db = new DynamoDB(dynamoDbClientParams);
const TableName = process.env.LESQ_TABLE;

module.exports.handler = async (event, context) => {
    const { merchantId } = event.pathParameters;

    console.log("Obtaining menu for merchant: ", merchantId);
    try {
        const response = await db.getItem({
            Key: {
                "PK": { S: "PK3" },
                "SK": { S: "SK3" }
            },
            TableName
        }).promise();
        console.log(response);
        return {
            statusCode: 200,
            body: JSON.stringify(response)
        };
    } catch (error) {
        console.log("Error: ", error);
    }
}