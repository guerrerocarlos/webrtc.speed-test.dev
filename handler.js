'use strict';
const AWS = require("aws-sdk")
const util = require("util")

const SQS = new AWS.SQS()

// FROM websocket TO queue
function sendtoQueue(destinationQueue, event) {
  if (destinationQueue) {
    var params = {
      QueueUrl: destinationQueue,
      MessageBody: (typeof event !== 'string') ? JSON.stringify(event) : event,
    };
    console.log("sendtoQueue", params)
    return SQS.sendMessage(params).promise();
  }
}

module.exports.websocket = async (event, context) => {
  await sendtoQueue(process.env.processQueue, event)

  console.log("return OK")
  return {
    statusCode: 200,
    body: "OK"
  };
};

// FROM queue TO process()
const apigatewaymanagementapis = {}

async function sendMessage(event, payload, connectionId) {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;

  if (!apigatewaymanagementapis[domain + stage]) {
    const callbackUrlForAWS = util.format(util.format('https://%s/%s', domain, stage));
    const apigatewaymanagementapi = new AWS.ApiGatewayManagementApi({
      apiVersion: '2018-11-29',
      endpoint: callbackUrlForAWS,
    });
    apigatewaymanagementapis[domain + stage] = apigatewaymanagementapi
  }

  const data = {
    ConnectionId: connectionId || event.requestContext.connectionId, // connectionId of the receiving ws-client
    Data: JSON.stringify(payload),
  }
  console.log("postToConnection", data)
  try {
    const result = await apigatewaymanagementapis[domain + stage].postToConnection(
      data).promise()
      console.log("🟢", result)
  } catch (err) {
    remove(peerIds, connectionId || event.requestContext.connectionId)
    console.log('🟠', err)
  }
}

let peerIds = []

function remove(arr, what) {
  var found = arr.indexOf(what);

  while (found !== -1) {
      arr.splice(found, 1);
      found = arr.indexOf(what);
  }
}


module.exports.process = async (events, ctx) => {
  console.log("🗂 ctx", JSON.stringify(ctx))

  let records = events.Records.map((record) => JSON.parse(record.body));

  for (let event of records) {
    if (event.body) {
      try {
        console.log("🚀 process", JSON.stringify(event, null, 2))
        let body = JSON.parse(event.body)
  
        if (body.event === "init") {
          console.log("✋ SEND peers!")
          await sendMessage(event, { peerIds, myId: event.requestContext.connectionId })
          peerIds.push(event.requestContext.connectionId)
        }
  
        if (body.event === "clean") {
          peerIds = []
          await sendMessage(event, { result: "cleaned" })
        }
  
        if (body.event === "signal") {
          console.log("🐦 SEND SINAL TO", body.toPeerId)
          await sendMessage(event, { event: "signal", fromPeerId: event.requestContext.connectionId, data: body.data }, body.toPeerId)
        }
      } catch (err) {
        console.log("ERR", err)
      }
      
    }

    if (event.requestContext.eventType == "DISCONNECT") {
      console.log("💀 REMOVE", event.requestContext.connectionId)

      let reportManDown = []
      remove(peerIds, event.requestContext.connectionId)
      for (let peerId of peerIds) {
        reportManDown.push(sendMessage(event, { event: "disconnect", disconnectedPeerId: event.requestContext.connectionId }, peerId))
      }

      await Promise.all(reportManDown)
    }
  }

};