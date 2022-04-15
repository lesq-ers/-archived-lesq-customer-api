// const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDB } = require("aws-sdk");

// const dynamoDbClientParams = {};
// if (process.env.IS_OFFLINE) {
//     dynamoDbClientParams.region = 'local'
//     dynamoDbClientParams.endpoint = 'http://localhost:8000'
//     dynamoDbClientParams.accessKeyId = 'DEFAULT_ACCESS_KEY'  // needed if you don't have aws credentials at all in env
//     dynamoDbClientParams.secretAccessKey = 'DEFAULT_SECRET' // needed if you don't have aws credentials at all in env
// }
// console.log("CLIENT PARAMS:", dynamoDbClientParams);
// const dynamoDbClient = new AWS.DynamoDB.DocumentClient(dynamoDbClientParams);

const db = new DynamoDB({
    region: 'local',
    endpoint: 'http://localhost:8000'
});
const TableName = process.env.LESQ_TABLE;

module.exports.handler = async (event, context) => {
    const { merchantId } = event.pathParameters;

    console.log("Obtaining menu for merchant: ", merchantId);
    // const command = new PutItemCommand({
    //     TableName,
    //     Item: {
    //         PK: { S: "PK2" },
    //         SK: { S: "SK2" }
    //     }
    // });
    try {
        // const response = await dynamoDbClient.send(command);
        const response = await db.putItem({
            TableName,
            Item: {
                PK: { S: "PK3" },
                SK: { S: "SK3" },
                Bubot: { S: "KLaon" },
            }
        }).promise();
        console.log("Success", response);
        const x = await db.getItem({
            Key: {
                "PK": { S: "PK3" },
                "SK": { S: "SK3" }
            },
            TableName
        }).promise();
        console.log(x);
        return {
            statusCode: 200,
            body: JSON.stringify(x)
        };
    } catch (error) {
        console.log("Error: ", error);
    }
}