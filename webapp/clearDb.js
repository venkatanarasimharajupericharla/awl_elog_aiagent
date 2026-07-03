const http = require('http');

const options = {
    hostname: 'localhost',
    port: 8081,
    path: '/sales-order/ElogForms',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const forms = JSON.parse(data).value;
        console.log(`Found ${forms.length} forms to delete`);
        
        forms.forEach(form => {
            const delReq = http.request({
                hostname: 'localhost',
                port: 8081,
                path: `/sales-order/ElogForms(${form.ID})`,
                method: 'DELETE'
            }, (delRes) => {
                console.log(`Deleted ${form.ID} - Status: ${delRes.statusCode}`);
            });
            delReq.end();
        });
    });
});
req.end();
