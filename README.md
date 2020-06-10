This project contains a small script to pull public data from fpds and generate a sql query to insert that data into a 
psql table.

## Start
`npm install`
`npm run start`

The script takes about 1 hour to complete, and the generated sql will be placed in `test.sql` file.
Plese modify parseXml.js file for changes to sql statement generated if you want different tables, columns, or values.

The total number of pages to query is a variable set in `app.js` file with variable name `maxPages`. If you want to test
a small number of pages initially, modify the `maxPages` variable for how many total pages you'd like to fetch.

By default, the script makes queries in batches of 40,000 requests at a time, waits for 60 seconds, and fires next batch.
Feel free to modify the number of batches as you see fit.
