const fs = require('fs');
let file = fs.readFileSync('index.html', 'utf8');

const headContent = `
    <meta name="theme-color" content="#1e40af" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Báo cáo" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <link rel="apple-touch-icon" href="/icon.svg" />
`;

if (!file.includes('mobile-web-app-capable')) {
    file = file.replace(
        '</head>',
        headContent + '\n  </head>'
    );
    fs.writeFileSync('index.html', file);
}
