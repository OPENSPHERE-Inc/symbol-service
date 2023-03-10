import "./env";
import {NodeTrackerService, SymbolService} from "../services";
import assert from "assert";
import {Account, Mosaic, UInt64} from "symbol-sdk";
import {Logger} from "../libs";


describe("NodeTrackerService", () => {
    let nodeTracker: NodeTrackerService;
    let account1: Account;
    let account2: Account;

    beforeAll(() => {
        Logger.init({ log_level: Logger.LogLevel.DEBUG });

        assert(process.env.STATS_SERVICE_URL);
        assert(process.env.NETWORK_TYPE);
        nodeTracker = new NodeTrackerService(
            process.env.STATS_SERVICE_URL,
            Number(process.env.NETWORK_TYPE),
            { maxParallels: 5 }
        );

        assert(process.env.SIGNER1_PRIVATE_KEY);
        assert(process.env.PAYER_PRIVATE_KEY);
        account1 = Account.createFromPrivateKey(process.env.SIGNER1_PRIVATE_KEY, Number(process.env.NETWORK_TYPE));
        account2 = Account.createFromPrivateKey(process.env.PAYER_PRIVATE_KEY, Number(process.env.NETWORK_TYPE));
    });

    it("Discover nodes", async () => {
        await nodeTracker.discovery();

        expect(nodeTracker.availableNodes.length).toBeTruthy();
        expect(nodeTracker.discoveredAt).toBeTruthy();

        console.debug(`Available nodes = ${nodeTracker.availableNodes.length}`);
    }, 60000);

    it("Ping all nodes", async () => {
        const mock = jest.fn();
        const subscription = await nodeTracker.pingObserver.subscribe(({node, index, total}) => {
            mock();
            if (node.latency) {
                console.debug(`${index + 1} of ${total}: ${node.apiStatus.restGatewayUrl} [${node.latency} msecs]`);
            } else {
                console.debug(`${index + 1} of ${total}: ${node.apiStatus.restGatewayUrl} [${node.latest_error}]`);
            }
        });
        await nodeTracker.pingAll();
        subscription.unsubscribe();

        expect(mock).toBeCalled();
        expect(nodeTracker.availableNodes.filter((node) => node.latency).shift()).toBeDefined();

        const topNode = nodeTracker.availableNodes
            .sort((n1, n2) =>
                (n1.latency || Number.MAX_SAFE_INTEGER) - (n2.latency || Number.MAX_SAFE_INTEGER))
            .shift();

        expect(topNode?.latency).toBeDefined();

        console.debug(`${topNode?.apiStatus.restGatewayUrl} [${topNode?.latency} msecs]`);
    }, 60000);

    it("Pick a node", async () => {
        const pickedNode = nodeTracker.pickOne(10, 1000);

        expect(pickedNode).toBeDefined();
        expect(pickedNode?.latency).toBeLessThanOrEqual(1000);

        console.debug(`${pickedNode?.apiStatus.restGatewayUrl} [${pickedNode?.latency} msecs]`);

        assert(pickedNode);
        const symbolService = new SymbolService({ node_url: pickedNode.apiStatus.restGatewayUrl });

        const { networkCurrencyMosaicId, networkGenerationHash } = await symbolService.getNetwork();

        const transferTx1 = await symbolService.createTransferTx(
            account1.publicAccount,
            account2.address,
            new Mosaic(networkCurrencyMosaicId, UInt64.fromUint(1000000)),
            "test1message",
        );

        const aggregateTx = await symbolService.composeAggregateCompleteTx(
            await symbolService.getFeeMultiplier(0.23),
            0,
            [ transferTx1 ]
        );
        const signedTx = account1.sign(aggregateTx, networkGenerationHash);

        await symbolService.announceTxWithCosignatures(signedTx, []);
        const result = (await symbolService.waitTxsFor(account1, signedTx.hash, "confirmed")).shift();

        expect(result?.error).toBeUndefined();
    }, 600000);

    it("Check health of node", async () => {
        const pickedNode = nodeTracker.pickOne(10, 1000);
        assert(pickedNode);
        const healthyNode = await nodeTracker.checkHealth(pickedNode.apiStatus.restGatewayUrl);

        expect(healthyNode).toBeDefined();
        expect(healthyNode?.latest_error).toBeUndefined();
        expect(healthyNode?.latency).toBeDefined();
    }, 60000);

    it("Pick multiple nodes", async () => {
        const pickedNodes = nodeTracker.pickMulti(5, 10, 1500);

        expect(pickedNodes.length).toBeTruthy();

        console.debug(`Picked nodes = ${pickedNodes.length}`);
        pickedNodes.forEach((node) => {
            expect(node.latency).toBeLessThanOrEqual(1500);
            console.debug(`${node.apiStatus.restGatewayUrl} [${node.latency} msecs]`);
        });
    }, 60000);

    it("Abort pinging", async () => {
        const subscription = await nodeTracker.pingObserver.subscribe(({node, index, total}) => {
            if (node.latency) {
                console.debug(`${index + 1} of ${total}: ${node.apiStatus.restGatewayUrl} [${node.latency} msecs]`);
            } else {
                console.debug(`${index + 1} of ${total}: ${node.apiStatus.restGatewayUrl} [${node.latest_error}]`);
            }
        });
        await new Promise((resolve) => {
            nodeTracker.pingAll().then(resolve);
            setTimeout(() => nodeTracker.abortPinging(), 1000);
        }).finally(() => subscription.unsubscribe());

        expect(nodeTracker.isAborting).toBeTruthy();
        expect(nodeTracker.numActiveWebSockets).toBe(0);
    }, 60000);

    it("Single node discovery and pinging", async () => {
        const pickedNode = nodeTracker.pickOne(10, 1000);
        assert(pickedNode);
        const discoveredNodes = await nodeTracker.discovery([ pickedNode.apiStatus.restGatewayUrl ])

        expect(discoveredNodes.length).toBe(1);
        expect(discoveredNodes[0].apiStatus.restGatewayUrl).toBe(pickedNode.apiStatus.restGatewayUrl);

        const pingedNode = await nodeTracker.checkHealth(pickedNode.apiStatus.restGatewayUrl, 1500);

        expect(pingedNode).toBeDefined();
        expect(pingedNode?.latest_error).toBeFalsy();
        expect(pingedNode?.latency).toBeTruthy();
    }, 60000);

});