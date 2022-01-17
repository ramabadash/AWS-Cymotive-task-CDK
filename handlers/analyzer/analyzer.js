const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME;

/***** NUMBER OF ANOMALIES *****/
// Check if in the range - yes return 0, no reutn 1
const inTheRange = signals_object => {
  return signals_object.sum > signals_object.acceptableMaxValue
    ? 1
    : signals_object.sum < signals_object.acceptableMinValue
    ? 1
    : 0;
};

// Run over reports
const getSignals = async tableName => {
  const params = {
    TableName: tableName,
  };
  const allReports = await dynamodb.scan(params).promise(); // Get reports from DB

  let outOfRange = 0;

  // Run on all the reports
  for (const report of allReports.Items) {
    const { signalsPerMinute } = report;
    const { windows, airBag, infotainment } = signalsPerMinute;

    outOfRange += inTheRange(windows); // windows
    outOfRange += inTheRange(airBag); // airBag
    outOfRange += inTheRange(infotainment); // infotainment
  }
  return { out_of_range_signals: outOfRange };
};

/***** NUMBER OF REPORTS/ VEHICLES *****/
const countDataInTable = async tableName => {
  const params = {
    TableName: tableName,
    Select: 'COUNT',
  };
  return {
    number_of_reports_about_vehicles: (await dynamodb.scan(params).promise())
      .Count,
  };
};

/***** MAIN FUNCTION *****/
const analyzer = async event => {
  switch (event.path) {
    case '/numberOfReports/':
    case '/numberOfReports':
      return {
        statusCode: 200,
        body: JSON.stringify(await countDataInTable(TABLE_NAME)),
      };
    case '/numberOfVehicles/':
    case '/numberOfVehicles':
      return {
        statusCode: 200,
        body: JSON.stringify(await countDataInTable(TABLE_NAME)),
      };
    case '/numberOfAnomalies/':
    case '/numberOfAnomalies':
      return {
        statusCode: 200,
        body: JSON.stringify(await getSignals(TABLE_NAME)),
      };
  }
  return {
    statusCode: 400,
    body: JSON.stringify('No such path'),
  };
};

exports.handler = analyzer;
