const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({ region: process.env.DEFAULT_REGION_NAME });

module.exports.handler = async (event, context) => {
    console.log("Event:", event);

    const command = new PutItemCommand({
        TableName: process.env.LESQ_TABLE,
        Item: {
            PK: {S:"PK1"},
            SK: {S:"SK1"}
        }
    });
    try {
        const response = await client.send(command);
        console.log("Success", response);
        return {
            statusCode: 200,
            body: JSON.stringify({ text: "success" })
        };
    } catch (error) {
        console.log("Error: ", error);
    }
}