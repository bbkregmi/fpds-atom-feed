const async = require('async');
const https = require('https');
var fs = require('fs');
var parseString = require('xml2js').parseString;
var sqlQueryUtil = require('./parseXml');

// Contains parsed values from fetched requests. The values here will be joined (comma separated) to create a sql insert statement
var dataValues = [];

// Pages that returned a bad request, and we need to try and fetch again
var refetchPagesArray = [];

// Reference to bad requests that we've already made a second attempt on
// Useful so that we know to stop even when there are bad requests.
var previouslyRefetchedArray = [];

// Make this many requests at a time, then sleep for 60 seconds to prevent stressing server
const requestBatch = 40000;

// Total pages to query from fpds
const maxPages = 322450;

const numBatches = Math.ceil(maxPages / requestBatch);

// Time sockets out after 30 seconds so they can be re-used.
// When keep-alive is true, default timeout is 2 mins. 30 seconds should be fine
var myAgent = new https.Agent({
  keepAlive: true,
  timeout: 30000,
})

// Method to create a single http request for 1 page (~ 10 entries)
function createRequestsForPage(page, callback) {
  return https.get(
    {
      hostname: 'www.fpds.gov',
      path: `/ezsearch/FEEDS/ATOM?s=FPDS&FEEDNAME=OFFICE&q=*%3A*&start=${page}`, 
      agent: myAgent,
    }, 
  (resp) => {

    let data = '';

    // A chunk of data has been recieved.
    resp.on('data', (chunk) => {
      data += chunk;
    });
  
    // The whole response has been received. Parse the result, and add it to our query values
    resp.on('end', () => {
      if (page % 5000 === 0) {
        console.log(page);
      }

      // Manually set keep alive to false. 
      // I found that if I didn't, the sockets would stay open with status of TIME_WAIT
      // The response for this request is complete, so we can close this socket connection and
      // re-use it for another request
      if (resp.socket) {
        resp.socket.setKeepAlive(false);
        resp.socket.destroy();
      }

      // parseString converts an xml into json - from xml2js library
      parseString(data, ((err, xml) => {

        // FPDS sometimes gives bad resonse if the server is stressed on load
        // Add pages we got bad response from to list of pages we'll need to refetch
        if (err || !xml || !xml.feed || !xml.feed.entry) {
          refetchPagesArray.push(page);
          return;
        }
        
        const parsedPage = sqlQueryUtil.parseXml(err, xml);
        dataValues.push(...parsedPage);
      }));
      callback(null,null);
    });
  }).on('error', (err) => {

    // The request failed to properly go through, add to list of pages we'll need to re-fetch later
    refetchPagesArray.push(page);
    callback(null, null);
  });
}

// Method to create 1 batch of request - 1 batch is {requestBatch} amount of requests
function generateRequests(startIndex) {
  const endPointPage = Math.min(maxPages, startIndex + requestBatch);
  const requests = [];

  // Loop increments by 10 to match page num in fpds
  for (let i=startIndex; i < endPointPage; i = i+10) {
    requests.push(function(callback){
       createRequestsForPage(i, callback);
    });
  }

  return requests;
}


const totalRequests = [];

// Create all batches of requests and add to array
for (let i = 0; i < numBatches; i++) {
  totalRequests.push(generateRequests(requestBatch * i));
}

indexCounter = 0;

// Makes async request, one batch at a time. Then sleeps for 60 seconds to allow
// sockets to time out before firing next batch. Once all batches are complete, this
// goes through requests that failed or gave bad data, and re fetches those pages.
// It does so repeatedly until there are no more pages to fetch, sleeping 60 seconds in
// between.
function makeParallelRequests(requests) {

  const startIndex = requestBatch * indexCounter;
  console.log(`Starting new batch from ${startIndex}`);
  console.time("batchTime");

  // Make the requests, 150 at a time
  async.parallelLimit(requests, 150, function(err, results){

    console.log(`Finished batch started from ${startIndex}`);
    console.timeEnd('batchTime');

    // Finished previous batch, increment counter to indicate we need to fetch next batch.
    indexCounter++;

    const newStartIndex = requestBatch * indexCounter;
    if ( newStartIndex > maxPages && refetchPagesArray.length === 0) {
      fs.writeFileSync('test.sql', sqlQueryUtil.preInsertString + dataValues.join(','));
      console.log('Completed all requests');
      return;
    } else if (newStartIndex > maxPages) {

      console.log('Complated all pages - Starting on making requests for items that were possibly dropped');

      console.log(`Number of re-fetch needed: ${refetchPagesArray.length}`);

      // Very rare case - We managed to make no progress when re-fetching bad requests.
      // This means that whatever data is on these pages are likely just bad data that we are
      // unable to parse.
      if (previouslyRefetchedArray.length === refetchPagesArray.length) {
        console.log('Number of requests has not changed since last request. Terminating without fetching all pages');
        console.log(`These pages were not properly fetched:\n\n  [${previouslyRefetchedArray.join(', ')}]\n\n`);
        fs.writeFileSync('test.sql', sqlQueryUtil.preInsertString + dataValues.join(','));
        return;
      }
      console.log(`Sleeping for 60 seconds before starting leftover requests`);
      
      previouslyRefetchedArray = [...refetchPagesArray];
      refetchPagesArray = [];

      const requests = previouslyRefetchedArray.map(pageNumber => {
        return function (callback) {
          createRequestsForPage(pageNumber, callback);
        };
      });

      // Wait 60 seconds to let server close alive connections, and fetch bad requests
      setTimeout(() => {
        makeParallelRequests(requests);
      }, 60000);

    } else {
      console.log(`Sleeping for 60 seconds before starting new batch`);

      // Wait 60 seconds to let server close alive connections and fetch next batch
      setTimeout(() => {
        makeParallelRequests(totalRequests[indexCounter]);
      }, 60000);
    }
  });
}

makeParallelRequests(totalRequests[indexCounter]);

