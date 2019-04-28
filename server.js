const express = require('express');
const app = express();

const conditionRouter = require('./route/condition');
const path = require('path');
const fs = require('fs');

app.use('/', conditionRouter);


// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});