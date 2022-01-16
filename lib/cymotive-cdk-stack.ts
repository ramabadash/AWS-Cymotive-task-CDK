// Types
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
//
import * as path from 'path';
// Services
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import {
  Role,
  ServicePrincipal,
  PolicyDocument,
  PolicyStatement,
  Effect,
  ArnPrincipal,
} from 'aws-cdk-lib/aws-iam'; // IAM
import { LambdaIntegration } from 'aws-cdk-lib/aws-apigateway'; // API Gateway
import { BillingMode } from 'aws-cdk-lib/aws-dynamodb'; // DynamoDb
import { EventType } from 'aws-cdk-lib/aws-s3'; // S3

/********** MAIN SECTION **********/

export class CymotiveCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    /***** PHASE 1 *****/
    //Create api gateway
    const idsGateway = new apigateway.RestApi(this, 'ids-gateway-cdk', {
      deployOptions: {
        stageName: 'api',
      },
    });

    // S3 Bucket
    const reportsBucket = new s3.Bucket(this, 'reports-bucket', {
      // versioned: true,
      bucketName: 'cymotive-task-bucket-cdk',
    });

    // Porter role
    const porterRole = new Role(this, 'porter-role-cdk', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'PorterRole',
      inlinePolicies: {
        PorterPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              // Bucket policy - only to put objects
              effect: Effect.ALLOW,
              actions: ['s3:PutObject'],
              resources: [reportsBucket.bucketArn],
            }),
            new PolicyStatement({
              // CloudWatch policy
              effect: Effect.ALLOW,
              actions: [
                'logs:CreateLogStream',
                'logs:CreateLogGroup',
                'logs:PutLogEvents',
              ],
              resources: [
                `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/*:*:*`,
              ],
            }),
          ],
        }),
      },
    });

    // Porter lambda
    const porter = new lambda.Function(this, 'porter-lambda-cdk', {
      functionName: 'porter-cdk',
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'porter.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../handlers/porter')),
      environment: {
        BUCKET_NAME: reportsBucket.bucketName,
        BUCKET_ARN: reportsBucket.bucketArn,
      },
      role: porterRole,
    });

    // POST request from the ids-gateway-cdk to the porter lambda
    idsGateway.root.addMethod('POST', new LambdaIntegration(porter));

    /***** PHASE 2 *****/

    //DynamoDB Table
    const idsTable = new dynamodb.Table(this, 'ids-table-cdk', {
      partitionKey: { name: 'vehicleId', type: dynamodb.AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      tableName: 'ids-table-cdk',
    });

    // Role for ingest lambda - read from s3 and put on dynamoDb
    const ingestRole = new Role(this, 'ingest-role-cdk', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'ingestRole',
      inlinePolicies: {
        PorterPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [
                `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/*:*:*`,
              ],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ['s3:ListBucket'],
              resources: [reportsBucket.bucketArn],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ['dynamodb:PutItem'],
              resources: [idsTable.tableArn],
            }),
          ],
        }),
      },
    });

    //Create ingest lambda
    const ingest = new lambda.Function(this, 'ingest-cdk', {
      functionName: 'ingest-cdk',
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'ingest.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../handlers/ingest')),
      environment: {
        TABLE_NAME: idsTable.tableName,
      },
      role: ingestRole,
    });

    // Bucket policy to accept porter and ingest
    reportsBucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: [reportsBucket.arnForObjects('*')],
        actions: ['s3:PutObject', 's3:GetObject'],
        principals: [
          new ArnPrincipal(porterRole.roleArn),
          new ArnPrincipal(ingestRole.roleArn),
        ],
      })
    );

    //Add trigger to ingest on s3 put object event
    reportsBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(ingest)
    );

    /***** PHASE 3 *****/
    // Create role for analyzer lambda to scan from dynamoDb
    const analyzerRole = new Role(this, 'analyzerRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'analyzerRole',
      inlinePolicies: {
        PorterPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [
                `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/*:*:*`,
              ],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ['dynamodb:Scan'],
              resources: [idsTable.tableArn],
            }),
          ],
        }),
      },
    });

    //Create ingest lambda
    const analyzer = new lambda.Function(this, 'analyzer-cdk', {
      functionName: 'analyzer-cdk',
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'analyzer.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../handlers/analyzer')),
      environment: {
        TABLE_NAME: idsTable.tableName,
      },
      role: analyzerRole,
    });

    //Add routes to gateway
    const numberOfReports = idsGateway.root.addResource('numberOfReports');
    const numberOfVehicles = idsGateway.root.addResource('numberOfVehicles');
    const numberOfAnomalies = idsGateway.root.addResource('numberOfAnomalies');
    numberOfReports.addMethod('GET', new LambdaIntegration(analyzer));
    numberOfVehicles.addMethod('GET', new LambdaIntegration(analyzer));
    numberOfAnomalies.addMethod('GET', new LambdaIntegration(analyzer));
  }
}
