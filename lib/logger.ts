// import * as logfire from 'logfire';

// logfire.configure({
//   token: 'pylf_v1_eu_qXWs4vhgCDG92Dt1wRLD1xTBZ5Z4mxTqJRB56H4pnl2R',
//   serviceName: 'starter-project',
//   serviceVersion: '1.0.0',
// });

// console.log("🟡 Script started");

// async function main() {
//   logfire.info('✅ Hello from Node.js!', {
//     'attribute-key': 'attribute-value'
//   }, {
//     tags: ['example3', 'example4']
//   });

//   console.log("🟢 Logfire log queued");

//   // Wait 2 seconds for logs to flush
//   await new Promise(resolve => setTimeout(resolve, 2000));

//   console.log("📤 Finished waiting. Exiting.");
//   process.exit(0);
// }

// main().catch(console.error);


import * as logfire from 'logfire';

logfire.configure({
  token:  process.env.LOGGER_API_KEY, // Your actual token
  serviceName: 'starter-project',
  serviceVersion: '1.0.0',
});

