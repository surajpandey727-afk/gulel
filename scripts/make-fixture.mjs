// Builds a clearly-labelled TEST workbook (fictional companies) for the import acceptance test.
import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";
const rows = [
  { "Company": "Harbour & Vine Foods Ltd", "Web": "https://www.harbourvine.test", "Country": "United Kingdom", "City": "Bristol", "Industry": "FMCG · Snacks", "Contact": "Amelia Grant", "Designation": "Chief Marketing Officer", "E-mail ID": "amelia.grant@harbourvine.test", "Status": "Prospect" },
  { "Company": "Harbour and Vine Foods", "Web": "harbourvine.test", "Country": "UK", "City": "Bristol", "Industry": "FMCG", "Contact": "", "Designation": "", "E-mail ID": "hello@harbourvine.test", "Status": "" },
  { "Company": "Kesar Valley Beverages Pvt. Ltd.", "Web": "kesarvalley.test", "Country": "India", "City": "Pune", "Industry": "Beverages", "Contact": "Rohan Mehta", "Designation": "Co-Founder & CEO", "E-mail ID": "rohan@kesarvalley.test", "Status": "Client" },
  { "Company": "Kesar Valley Beverages", "Web": "", "Country": "India", "City": "Pune", "Industry": "Beverages", "Contact": "Priya Nair", "Designation": "Head of Brand", "E-mail ID": "priya.nair@kesarvalley.test", "Status": "" },
  { "Company": "Northstar Outdoor Co", "Web": "northstar-outdoor.test", "Country": "", "City": "Manchester", "Industry": "Apparel", "Contact": "Tom Hale", "Designation": "Marketing Director", "E-mail ID": "info@northstar-outdoor.test", "Status": "" },
  { "Company": "Lotus Lane Home", "Web": "lotuslane.test", "Country": "IN", "City": "Bengaluru", "Industry": "Home & living", "Contact": "Ananya Rao", "Designation": "Founder", "E-mail ID": "not-an-email", "Status": "" },
  { "Company": "", "Web": "", "Country": "UK", "City": "", "Industry": "", "Contact": "Orphan Row", "Designation": "", "E-mail ID": "", "Status": "" },
];
const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Contacts UK+IN");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Empty");
writeFileSync("tests/fixtures/TEST-workbook-uk-india.xlsx", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log("wrote tests/fixtures/TEST-workbook-uk-india.xlsx");
