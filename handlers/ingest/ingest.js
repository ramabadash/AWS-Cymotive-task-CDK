const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

// Get the data that saved from the bucket
const getObjFromS3 = async (bucket, key) => {
  const params = {
    Bucket: bucket,
    Key: key,
  };
  try {
    const { Body } = await s3.getObject(params).promise();
    const obj = await JSON.parse(Body.toString());
    return obj;
  } catch (err) {
    console.log(err);
    const message = `Cannot get object ${key} from bucket ${bucket}.`;
    console.log(message);
    throw new Error(message);
  }
};

// Save one obj to DynamoDB table-"ids-table"
const saveCarObjToDB = async carObj => {
  console.log('Car object', carObj);
  const params = {
    TableName: process.env.TABLE_NAME,
    Item: carObj,
  };

  return await new Promise((resolve, reject) => {
    dynamodb.put(params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

const ingest = async event => {
  try {
    console.log('Event', event);
    for (const record of event.Records) {
      const reportFromS3 = await getObjFromS3(
        record.s3.bucket.name,
        record.s3.object.key
      );

      if (reportFromS3.length) {
        for (const carObj of reportFromS3) {
          await saveCarObjToDB(carObj);
        }
      } else {
        await saveCarObjToDB(reportFromS3);
      }
    }
    return { statusCode: 200, body: 'Done' };
  } catch (error) {
    console.log(error);
    return { statusCode: 500, body: JSON.stringify(error) };
  }
};

exports.handler = ingest;
