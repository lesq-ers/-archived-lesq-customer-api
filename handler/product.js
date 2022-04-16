const { DynamoDB } = require("aws-sdk");

const dynamoDbClientParams = {};
if (process.env.IS_OFFLINE) {
    dynamoDbClientParams.region = 'local'
    dynamoDbClientParams.endpoint = 'http://localhost:8000'
}
const db = new DynamoDB(dynamoDbClientParams);
const TableName = process.env.LESQ_TABLE;

module.exports.get = async (event, context) => {
    const { merchantId, productId } = event.pathParameters;
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

module.exports.create = async (event, context) => {
    const { merchantId } = event.pathParameters;
    const requestBody = JSON.parse(event.body);
    const product = {
        name: requestBody.name,
        description: requestBody.description,
        basePrice: requestBody.basePrice,
    }

    const { categoryId } = requestBody;
    const RequestItems = {
        [TableName]: {
            Keys: [
                {
                    PK: { S: `MERCHANT#${merchantId}` },
                    SK: { S: `CATEGORY#${`${categoryId}`.padStart(4, '0')}` }
                },
                {
                    PK: { S: `MERCHANT#${merchantId}` },
                    SK: { S: '_META#PRODUCT#COUNTER' }
                }
            ]
        }
    };

    const categoryDbResult = await db.batchGetItem({ RequestItems }).promise();
    const categoryResult = categoryDbResult.Responses[TableName].find((e) => e.SK.S.startsWith("CATEGORY#"));
    if (!categoryResult) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Product category not found.' })
        };
    }

    product.category = {
        id: categoryResult.id.S,
        name: categoryResult.name.S
    };

    const counterResult = categoryDbResult.Responses[TableName].find((e) => e.SK.S === "_META#PRODUCT#COUNTER");
    if (!counterResult) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Product counter not found, shit!' })
        };
    }
    product.id = counterResult.value.N

    const key = {
        PK: `MERCHANT#${merchantId}`,
        SK: `PRODUCT#${product.id.padStart(7, '0')}`
    }

    const createProductResult = await db.batchWriteItem({
        RequestItems: {
            [TableName]: [
                {
                    PutRequest: {
                        Item: {
                            PK: { S: key.PK },
                            SK: { S: key.SK },
                            id: { S: product.id },
                            name: { S: product.name },
                            description: { S: product.description },
                            basePrice: { N: product.basePrice },
                            categoryId: { S: product.category.id }
                        },
                    }
                },
                {
                    PutRequest: {
                        Item: {
                            PK: { S: `MERCHANT#${merchantId}` },
                            SK: { S: '_META#PRODUCT#COUNTER' },
                            value: { N: `${parseInt(product.id) + 1}` },
                        },
                    }
                }
            ]
        }
    }).promise();

    return {
        statusCode: 200,
        body: JSON.stringify(product)
    };
};