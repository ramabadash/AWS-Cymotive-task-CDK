const AWS = require('aws-sdk');
const s3 = new AWS.S3();

// Save object with the car id as key or objects arr with the key "reports" + random number
const upload = async reportsData => {
  const params = {
    Body: JSON.stringify(reportsData),
    ContentType: 'application/json',
    Bucket: process.env.BUCKET_NAME,
    Key: `reports-${Math.floor(100000 + Math.random() * 900000)}.json`,
  };

  return await new Promise((resolve, reject) => {
    s3.putObject(params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

const porter = async event => {
  console.log(event.body);
  try {
    for (const record of event.Records) {
      await upload(JSON.parse(record.body));
    }
    return {
      statusCode: 200,
      body: JSON.stringify('Success'),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 500,
      body: JSON.stringify(error),
    };
  }
};

exports.handler = porter;
