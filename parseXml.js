

// Modify this also to adjust for additional values / table name changes
const preInsertString = 'INSERT INTO public.fpds_office (name, office_id, agency_code, full_parent_path_name) VALUES ';

/**
 * Parses the json format for request on each page. Each page normally has 10 entries. An example format
 * for what the xml input will look like is defined in example-data.json. The return value of this function
 * is added to an array, and is collectively joined alongside the preInsertString to generate a sql query
 * for inserting data. The format of the query will be such: Insert INTO TABLE (COLUMN1, COLUMN2, ...) VALUES (VALUE1, VALUE2, ...);
 * 
 * @param {*} err 
 * @param {*} xml - A page in json form - see example-data.json for what the json will look like
 */
function parseXml(err, xml) {
  // XML is a json as defined in example-data.json

  // Normally, there are 10 entries per page
  const entries = xml.feed.entry;

  const parsedEntries = [];

  entries.forEach(entry => {
    const governmentOffice = entry.content[0]['ns1:governmentOffice'][0];
    var officeId = governmentOffice['ns1:officeID'] ? governmentOffice['ns1:officeID'][0].replace(/'/g, '"') : null;
    let officeName = governmentOffice['ns1:officeName'] ? governmentOffice['ns1:officeName'][0] : null;
    var officeAgencyCode = governmentOffice['ns1:agencyID'] ? governmentOffice['ns1:agencyID'][0].replace(/'/g, '"') : null;

    const hierarchyInfo = governmentOffice['ns1:hierarchyOfOrganizations'][0]['ns1:organization'];
    const parentPath = [];

    if (hierarchyInfo) {
      hierarchyInfo.forEach(heirarchy => {
        parentPath.push(heirarchy['$']['description']);
      });

      parentPath.push(officeName);
    }

    // Single quotes are added into the values here for string data
    var fullParentPath = parentPath.length > 0 ? `'${parentPath.join('.').replace(/'/g, '"')}'`: null;
    officeName = officeName ? `'${officeName.replace(/'/g, '"')}'`: null;
    officeId = officeId ? `'${officeId}'` : null;
    officeAgencyCode = officeAgencyCode ? `'${officeAgencyCode}'` : null;

    // A new value to add on - PLEASE REMEMBER TO ESCAPE SINGLE QUOTES FROM ALL VALUES
    const parsedValue = `(${officeName}, ${officeId}, ${officeAgencyCode}, ${fullParentPath})`;
    parsedEntries.push(parsedValue);
  });

  return parsedEntries;
}

exports.parseXml = parseXml;
exports.preInsertString = preInsertString;