const fs = require('fs');
let file = fs.readFileSync('index.html', 'utf8');

file = file.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0, viewport-fit=cover" />'
);

fs.writeFileSync('index.html', file);
