const config = {
  "service": "webrtc-speed-test",
  "frameworkVersion": "3",
  "provider": {
    "name": "aws",
    "profile": "gcdefault",
    "runtime": "nodejs12.x",
    "stage": "dev",
    "region": "eu-west-3",
    "logs": {
      "websocket": true
    },
    "deploymentBucket": {
      "name": "deployment-bucket-eu-west-3"
    },
    'iam': {
      'role': {
        'statements': [
          {
            "Effect": "Allow",
            "Action": [
              "execute-api:ManageConnections"
            ],
            "Resource": "arn:aws:execute-api:*:*:*/development/POST/@connections/*"
          },
          {
            "Effect": "Allow",
            "Action": [
              "sqs:*"
            ],
            "Resource": "arn:aws:sqs:*:*:*"
          }
        ],
      },
    },
    'environment': {
      'processQueue': {
        "Fn::Join": [
          "",
          [
            "https://sqs.",
            { Ref: "AWS::Region" },
            ".amazonaws.com/",
            { Ref: "AWS::AccountId" },
            "/${self:custom.processQueue}",
          ],
        ],
      },
    },
  },
  "functions": {
    "websocket": {
      "handler": "handler.websocket",
      "events": [
        // {
        //     "websocket": {
        //         "route": "$connect"
        //     }
        // },
        {
          "websocket": {
            "route": "$disconnect"
          }
        },
        {
          "websocket": {
            "route": "$default"
          }
        }
      ]
    },
    'process': {
      'handler': "handler.process",
      'reservedConcurrency': 1,
      'events': [
        {
          sqs: {
            arn: {
              "Fn::GetAtt": ["processQueue", "Arn"],
            },
            batchSize: 1,
            maximumBatchingWindow: 1
          },
        }]
    },
  },
  resources: {
    Resources: {
      processQueue: {
        Properties: {
          QueueName: "${self:custom.processQueue}",
          VisibilityTimeout: 900
        },
        Type: "AWS::SQS::Queue",
      },
    },
  }
}

config.custom = {
  processQueue: "${self:service}-${self:provider.stage}-process",
};

module.exports = config