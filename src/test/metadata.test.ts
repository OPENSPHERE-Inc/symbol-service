import "./env";
import {SymbolTest} from "./utils";
import {SymbolService} from "../services";
import {Account, Convert, KeyGenerator, Metadata, MetadataType, MosaicId, NamespaceId, UInt64} from "symbol-sdk";
import {v4 as uuidv4} from "uuid";


describe("Metadata", () => {
    let targetAccount: Account;
    const metadataKey = "test1key";
    const metadataValue = "test1value";
    let mosaicId: MosaicId;
    let namespaceId: NamespaceId;
    let metadata: Metadata | undefined;
    let symbolService: SymbolService;

    beforeAll(async () => {
        symbolService = SymbolTest.init();

        const { networkType } = await symbolService.getNetwork();
        targetAccount = Account.generateNewAccount(networkType);
        console.log(`target.address=${targetAccount.address.plain()}`);
    });

    it("Create account metadata", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();

        const tx = await symbolService.createMetadataTx(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            metadataKey,
            metadataValue,
        );
        const result = await SymbolTest.doAggregateTx([tx], sourceAccount, [ targetAccount ]);

        expect(result?.error).toBeUndefined();

        metadata = (await symbolService.searchMetadata(
            MetadataType.Account,
            { source: sourceAccount, target: targetAccount, key: metadataKey }
        )).shift();
        console.log(metadata);

        expect(metadata).toBeDefined();
        expect(metadata?.metadataEntry.sourceAddress).toStrictEqual(sourceAccount.address);
        expect(metadata?.metadataEntry.targetAddress).toStrictEqual(targetAccount.address);
        expect(metadata?.metadataEntry.scopedMetadataKey).toStrictEqual(KeyGenerator.generateUInt64Key(metadataKey));
        expect(metadata?.metadataEntry.value).toBe(metadataValue);
    }, 600000);

    it("Composite account metadata hash", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();

        const compositeHash = SymbolService.calculateMetadataHash(
            MetadataType.Account,
            sourceAccount.address,
            targetAccount.address,
            undefined,
            SymbolService.generateKey(metadataKey),
        );
        console.log(`compositeHash=${compositeHash}`);

        expect(compositeHash).toBe(metadata?.metadataEntry.compositeHash);

        const onChainMetadata = await symbolService.getMetadataByHash(compositeHash);

        expect(onChainMetadata).toBeDefined();
        expect(onChainMetadata).toStrictEqual(metadata);
    });

    it("Empty account metadata", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();

        const metadataValueBytes = Convert.utf8ToUint8(metadataValue);
        const newValue = "";
        const newValueBytes = Convert.utf8ToUint8(newValue);
        const tx = await symbolService.createMetadataTx(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            metadataKey,
            Convert.hexToUint8(Convert.xor(metadataValueBytes, newValueBytes)),
            newValueBytes.length - metadataValueBytes.length,
        );
        const result = await SymbolTest.doAggregateTx([tx], sourceAccount, [ targetAccount ]);

        expect(result?.error).toBeUndefined();

        metadata = (await symbolService.searchMetadata(
            MetadataType.Account,
            { source: sourceAccount, target: targetAccount, key: metadataKey }
        )).shift();

        expect(metadata).toBeUndefined();
    }, 600000);

    it("Define mosaic", async () => {
        const { signerAccount: creatorAccount } = await SymbolTest.getNamedAccounts();
        const mosaicDefinition = await symbolService.createMosaicDefinitionTx(
            creatorAccount.publicAccount,
            UInt64.fromUint(20),
            0,
            1,
        );
        const result = await SymbolTest.doAggregateTx(mosaicDefinition.txs, creatorAccount, []);
        mosaicId = mosaicDefinition.mosaicId;
        console.log(`mosaicId=${mosaicId.toHex()}`);

        expect(result?.error).toBeUndefined();
    }, 600000);

    it("Create mosaic metadata", async () => {
        const { signerAccount: creatorAccount } = await SymbolTest.getNamedAccounts();
        const mosaicMetadataTx = await symbolService.createMetadataTx(
            MetadataType.Mosaic,
            targetAccount.publicAccount,
            creatorAccount.publicAccount,
            mosaicId,
            metadataKey,
            metadataValue,
        );
        const result = await SymbolTest.doAggregateTx([mosaicMetadataTx], creatorAccount, [ targetAccount ]);

        expect(result?.error).toBeUndefined();

        metadata = (await symbolService.searchMetadata(
            MetadataType.Mosaic,
            { source: targetAccount, target: creatorAccount, key: metadataKey, targetId: mosaicId }
        )).shift();

        console.log(metadata);

        expect(metadata).toBeDefined();
        expect(metadata?.metadataEntry.sourceAddress).toStrictEqual(targetAccount.address);
        expect(metadata?.metadataEntry.targetAddress).toStrictEqual(creatorAccount.address);
        expect(metadata?.metadataEntry.targetId?.toHex()).toBe(mosaicId.toHex());
        expect(metadata?.metadataEntry.scopedMetadataKey).toStrictEqual(KeyGenerator.generateUInt64Key(metadataKey));
        expect(metadata?.metadataEntry.value).toBe(metadataValue);
    }, 600000);

    it("Composite mosaic metadata hash", async () => {
        const { signerAccount: creatorAccount } = await SymbolTest.getNamedAccounts();

        const compositeHash = SymbolService.calculateMetadataHash(
            MetadataType.Mosaic,
            targetAccount.address,
            creatorAccount.address,
            mosaicId,
            SymbolService.generateKey(metadataKey),
        );
        console.log(`compositeHash=${compositeHash}`);

        expect(compositeHash).toBe(metadata?.metadataEntry.compositeHash);

        const onChainMetadata = await symbolService.getMetadataByHash(compositeHash);

        expect(onChainMetadata).toBeDefined();
        expect(onChainMetadata).toStrictEqual(metadata);
    });

    it("Empty mosaic metadata", async () => {
        const { signerAccount: creatorAccount } = await SymbolTest.getNamedAccounts();

        const metadataValueBytes = Convert.utf8ToUint8(metadataValue);
        const newValue = "";
        const newValueBytes = Convert.utf8ToUint8(newValue);
        const tx = await symbolService.createMetadataTx(
            MetadataType.Mosaic,
            targetAccount.publicAccount,
            creatorAccount.publicAccount,
            mosaicId,
            metadataKey,
            Convert.hexToUint8(Convert.xor(metadataValueBytes, newValueBytes)),
            newValueBytes.length - metadataValueBytes.length,
        );
        const result = await SymbolTest.doAggregateTx([tx], creatorAccount, [ targetAccount ]);

        expect(result?.error).toBeUndefined();

        metadata = (await symbolService.searchMetadata(
            MetadataType.Mosaic,
            { source: targetAccount, target: creatorAccount, key: metadataKey, targetId: mosaicId }
        )).shift();

        expect(metadata).toBeUndefined();
    }, 600000);

    it("Register namespace", async () => {
        const { signerAccount: ownerAccount } = await SymbolTest.getNamedAccounts();
        const namespaceName = uuidv4();
        const namespaceTx = await symbolService.createNamespaceRegistrationTx(
            ownerAccount.publicAccount,
            namespaceName,
            UInt64.fromUint(86400),
        );
        const result = await SymbolTest.doAggregateTx([ namespaceTx ], ownerAccount, []);
        namespaceId = new NamespaceId(namespaceName);
        console.log(`namespaceId=${namespaceId.toHex()}`);

        expect(result?.error).toBeUndefined();
    }, 600000);

    it("Create namespace metadata", async () => {
        const { signerAccount: ownerAccount } = await SymbolTest.getNamedAccounts();
        const namespaceMetadataTx = await symbolService.createMetadataTx(
            MetadataType.Namespace,
            targetAccount.publicAccount,
            ownerAccount.publicAccount,
            namespaceId,
            metadataKey,
            metadataValue,
        );
        const result = await SymbolTest.doAggregateTx([namespaceMetadataTx], ownerAccount, [ targetAccount ]);

        expect(result?.error).toBeUndefined();

        metadata = (await symbolService.searchMetadata(
            MetadataType.Namespace,
            { source: targetAccount, target: ownerAccount, key: metadataKey, targetId: namespaceId }
        )).shift();

        console.log(metadata);

        expect(metadata).toBeDefined();
        expect(metadata?.metadataEntry.sourceAddress).toStrictEqual(targetAccount.address);
        expect(metadata?.metadataEntry.targetAddress).toStrictEqual(ownerAccount.address);
        expect(metadata?.metadataEntry.targetId?.toHex()).toBe(namespaceId.toHex());
        expect(metadata?.metadataEntry.scopedMetadataKey).toStrictEqual(KeyGenerator.generateUInt64Key(metadataKey));
        expect(metadata?.metadataEntry.value).toBe(metadataValue);
    }, 600000);

    it("Composite namespace metadata hash", async () => {
        const { signerAccount: ownerAccount } = await SymbolTest.getNamedAccounts();

        const compositeHash = SymbolService.calculateMetadataHash(
            MetadataType.Namespace,
            targetAccount.address,
            ownerAccount.address,
            namespaceId,
            SymbolService.generateKey(metadataKey),
        );
        console.log(`compositeHash=${compositeHash}`);

        expect(compositeHash).toBe(metadata?.metadataEntry.compositeHash);

        const onChainMetadata = await symbolService.getMetadataByHash(compositeHash);

        expect(onChainMetadata).toBeDefined();
        expect(onChainMetadata).toStrictEqual(metadata);
    });

    it("Empty namespace metadata", async () => {
        const { signerAccount: ownerAccount } = await SymbolTest.getNamedAccounts();

        const metadataValueBytes = Convert.utf8ToUint8(metadataValue);
        const newValue = "";
        const newValueBytes = Convert.utf8ToUint8(newValue);
        const tx = await symbolService.createMetadataTx(
            MetadataType.Namespace,
            targetAccount.publicAccount,
            ownerAccount.publicAccount,
            namespaceId,
            metadataKey,
            Convert.hexToUint8(Convert.xor(metadataValueBytes, newValueBytes)),
            newValueBytes.length - metadataValueBytes.length,
        );
        const result = await SymbolTest.doAggregateTx([tx], ownerAccount, [ targetAccount ]);

        expect(result?.error).toBeUndefined();

        metadata = (await symbolService.searchMetadata(
            MetadataType.Namespace,
            { source: targetAccount, target: ownerAccount, key: metadataKey, targetId: namespaceId }
        )).shift();

        expect(metadata).toBeUndefined();
    }, 600000);

    it("Throwaway metadata", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();

        const addTx = await symbolService.createMetadataTx(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            metadataKey,
            metadataValue,
        );
        const removeTx = await symbolService.createMetadataTx(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            metadataKey,
            metadataValue,
            -metadataValue.length
        );
        const result = await SymbolTest.doAggregateTx([ addTx, removeTx ], sourceAccount, [ targetAccount ]);

        expect(result?.error).toBeUndefined();

        metadata = (await symbolService.searchMetadata(
            MetadataType.Namespace,
            { source: sourceAccount, target: targetAccount, key: metadataKey }
        )).shift();

        expect(metadata).toBeUndefined();
    }, 600000);

    it("Failed with throwaway metadata", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();

        // Blocking metadata
        const blockTx = await symbolService.createMetadataTx(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            metadataKey,
            metadataValue,
        );
        let result = await SymbolTest.doAggregateTx([ blockTx ], sourceAccount, [ targetAccount ]);

        expect(result?.error).toBeUndefined();

        // This will be failed.
        const addTx = await symbolService.createMetadataTx(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            metadataKey,
            metadataValue,
        );
        const removeTx = await symbolService.createMetadataTx(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            metadataKey,
            metadataValue,
            -metadataValue.length
        );
        result = await SymbolTest.doAggregateTx([ addTx, removeTx ], sourceAccount, [ targetAccount ]);

        expect(result?.error).toBeDefined();
    }, 600000);

});