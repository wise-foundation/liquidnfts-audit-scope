const Web3 = require('web3');
const web3 = new Web3('http://localhost:9545');

const p0 = "30";
const p1 = "0x0000000000000000000000000000000000000000";
const p2 = "0x0000000000000000000000000000000000000000";

const PunksCode = require('./cryptoPunks/build/contracts/CryptoPunksMarket.json').bytecode
const PunksAbi = require('./cryptoPunks/build/contracts/CryptoPunksMarket.json').abi

async function deployToken() {

    try {
        const ganacheAccounts = await web3.eth.getAccounts();
        const contract = new web3.eth.Contract(PunksAbi);

        contract.deploy({
            arguments: [],
            data: PunksCode
        }).send({
            from: ganacheAccounts[0],
            gas: 4712388,
            gasPrice: 100000000000
        }).then((deployment) => {
            console.log('CryptoPunks was deployed at the following address:');
            console.log(deployment.options.address);
        }).catch((err) => {
            console.error(err);
        });

    } catch (e) {
        console.log(e);
    }
}


deployToken();
