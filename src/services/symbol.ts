import {
    Account,
    AccountMetadataTransaction,
    Address,
    AggregateTransaction,
    Convert,
    CosignatureSignedTransaction,
    CosignatureTransaction,
    Crypto,
    Deadline,
    IListener,
    InnerTransaction,
    KeyGenerator,
    Metadata,
    MetadataSearchCriteria,
    MetadataType,
    MosaicDefinitionTransaction,
    MosaicFlags,
    MosaicId,
    MosaicMetadataTransaction,
    MosaicNonce,
    MosaicSupplyChangeAction,
    MosaicSupplyChangeTransaction,
    NamespaceId,
    NamespaceMetadataTransaction,
    NamespaceRegistrationTransaction,
    NetworkConfiguration,
    NetworkType,
    PublicAccount, RepositoryFactory, RepositoryFactoryConfig,
    RepositoryFactoryHttp,
    SignedTransaction, Transaction,
    TransactionFees,
    TransactionGroup,
    UInt64
} from "symbol-sdk";
import assert from "assert";
import {firstValueFrom, Subscription} from "rxjs";
import moment from "moment";
import {sha3_256} from "js-sha3";
import {Logger} from "../libs";
import Long from "long";


export interface SignedAggregateTx {
    signedTx: SignedTransaction;
    cosignatures: CosignatureSignedTransaction[];
    maxFee: UInt64;
}

export interface SymbolServiceConfig {
    // Required to set up Node URL
    node_url: string;
    fee_ratio: number;
    deadline_hours: number;
    batch_size: number;
    max_parallels: number;
    repo_factory_config?: RepositoryFactoryConfig;
    repo_factory?: RepositoryFactory;
}

export type MetadataTransaction = AccountMetadataTransaction |
    MosaicMetadataTransaction |
    NamespaceMetadataTransaction;


export class SymbolService {

    // Get numerical string
    public static toXYM(microXYM: string | Long | UInt64) {
        const value = microXYM instanceof Long
            ? microXYM
            : Long.fromString(microXYM.toString());
        const decimal = `000000${value.mod(1000000).toString()}`
            .slice(-6)
            .replace(/0+$/g, '');
        const integer = value.div(1000000).toString();

        return `${integer}${decimal && '.' + decimal}`;
    };

    // Get UInt64 of full scale XYM
    public static toMicroXYM(xym: string | number) {
        const [integer, decimal] = xym.toString().split('.');

        return UInt64.fromNumericString(Long.fromString(integer).mul(1000000).add(
            Long.fromString(decimal ? `${decimal}000000`.slice(0, 6) : '0')
        ).toString());
    };

    public static generateKey = (key: string) => KeyGenerator.generateUInt64Key(key);

    public static createSignedTxWithCosignatures(
        signedTx: SignedTransaction,
        cosignatureSignedTxs: CosignatureSignedTransaction[]
    ) {
        let payload = signedTx.payload;

        cosignatureSignedTxs.forEach((cosignedTransaction) => {
            payload += cosignedTransaction.version.toHex() + cosignedTransaction.signerPublicKey + cosignedTransaction.signature;
        });

        // Calculate new size
        const size = `00000000${(payload.length / 2).toString(16)}`;
        const formatedSize = size.substring(size.length - 8);
        const littleEndianSize =
            formatedSize.substring(6, 8) +
            formatedSize.substring(4, 6) +
            formatedSize.substring(2, 4) +
            formatedSize.substring(0, 2);

        payload = littleEndianSize + payload.substring(8);

        return new SignedTransaction(payload, signedTx.hash, signedTx.signerPublicKey, signedTx.type, signedTx.networkType);
    }

    public static createNamespaceId(value: string) {
        if (value.match(/^[0-9A-F]{16}$/)) {
            return new NamespaceId(UInt64.fromHex(value).toDTO());
        } else {
            return new NamespaceId(value);
        }
    }

    // Encrypt data with AES-GCM
    public static encryptBinary(plainData: Uint8Array, senderAccount: Account, recipientPubAccount: PublicAccount) {
        // FIXME: This has overhead of hex <-> uint8 conversion.
        return Convert.hexToUint8(
            Crypto.encode(
                senderAccount.privateKey,
                recipientPubAccount.publicKey,
                Convert.uint8ToHex(plainData),
                true
            )
        );
    }

    // Decrypt data with AES-GCM
    public static decryptBinary(encryptedData: Uint8Array, senderPubAccount: PublicAccount, recipientAccount: Account) {
        // FIXME: This has overhead of hex <-> uint8 conversion.
        return Convert.hexToUint8(
            Crypto.decode(
                recipientAccount.privateKey,
                senderPubAccount.publicKey,
                Convert.uint8ToHex(encryptedData)
            )
        );
    }

    public static calculateMetadataHash(
        type: MetadataType,
        sourceAddress: Address,
        targetAddress: Address,
        targetId: undefined | MosaicId | NamespaceId,
        key: UInt64,
    ) {
        const hasher = sha3_256.create()
        hasher.update(sourceAddress.encodeUnresolvedAddress());
        hasher.update(targetAddress.encodeUnresolvedAddress());
        hasher.update(Convert.hexToUint8Reverse(key.toHex()));
        hasher.update(Convert.hexToUint8Reverse(targetId?.toHex() || "0000000000000000"))
        hasher.update(Convert.numberToUint8Array(type, 1));
        return hasher.hex().toUpperCase();
    }

    config: SymbolServiceConfig = {
        node_url: "",
        fee_ratio: 0.0,
        deadline_hours: 2,
        batch_size: 100,
        max_parallels: 10,
    };

    // You MUST call once this function and setup Node URL before access the node.
    public constructor(cfg: Partial<SymbolServiceConfig>) {
        this.config = { ...this.config, ...cfg };
        this.network = null;
    }

    // Local cache
    network: {
        networkType: NetworkType,
        repositoryFactory: RepositoryFactory,
        epochAdjustment: number,
        networkGenerationHash: string,
        networkCurrencyMosaicId: MosaicId,
        transactionFees: TransactionFees,
        networkProperties: NetworkConfiguration,
        updated_at: number,
    } | null = null;

    public async getNetwork() {
        if (!this.network) {
            const repositoryFactory = this.config.repo_factory ||
                new RepositoryFactoryHttp(this.config.node_url, this.config.repo_factory_config);
            const epochAdjustment = await firstValueFrom(repositoryFactory.getEpochAdjustment());
            const networkGenerationHash = await firstValueFrom(repositoryFactory.getGenerationHash());
            const networkCurrencyMosaicId = (await firstValueFrom(repositoryFactory.getCurrencies())).currency.mosaicId;
            assert(networkCurrencyMosaicId);
            const networkHttp = repositoryFactory.createNetworkRepository();
            const transactionFees = await firstValueFrom(networkHttp.getTransactionFees());
            const networkType = await firstValueFrom(networkHttp.getNetworkType());
            const networkProperties = await firstValueFrom(networkHttp.getNetworkProperties());

            this.network = {
                networkType,
                repositoryFactory,
                epochAdjustment,
                networkGenerationHash,
                networkCurrencyMosaicId,
                transactionFees,
                networkProperties,
                updated_at: moment.now(),
            };
        }

        return this.network;
    }

    public async getFeeMultiplier(ratio: number = this.config.fee_ratio) {
        const { transactionFees } = await this.getNetwork();
        return transactionFees.minFeeMultiplier + transactionFees.averageFeeMultiplier * ratio;
    }

    private async announceTx(tx: SignedTransaction) {
        Logger.debug(`Announcing TX: ${tx.hash}`);
        const { repositoryFactory } = await this.getNetwork();
        return firstValueFrom(repositoryFactory.createTransactionRepository()
            .announce(tx));
    }

    public async signTx(signerAccount: Account, tx: Transaction) {
        const { networkGenerationHash } = await this.getNetwork();

        const generationHashBytes = Array.from(Convert.hexToUint8(networkGenerationHash));
        const serializedBytes = Array.from(Convert.hexToUint8(tx.serialize()));
        const signature = Transaction.signRawTransaction(
            signerAccount.privateKey,
            Uint8Array.from(
                tx.getSigningBytes(
                    serializedBytes,
                    generationHashBytes
                )
            )
        );
        const payload = Transaction.preparePayload(Uint8Array.from(serializedBytes), signature, signerAccount.publicKey);
        const hash = Transaction.createTransactionHash(payload, generationHashBytes);
        const signedTx = new SignedTransaction(payload, hash, signerAccount.publicKey, tx.type, tx.networkType);

        return { signature, hash, payload, signedTx };
    }

    public async convertToSignedTx(txWithSignature: Transaction) {
        assert(txWithSignature.signer);

        const { networkGenerationHash } = await this.getNetwork();
        const generationHashBytes = Array.from(Convert.hexToUint8(networkGenerationHash));

        const payload = txWithSignature.serialize();
        const hash = Transaction.createTransactionHash(payload, generationHashBytes);

        return new SignedTransaction(
            payload,
            hash,
            txWithSignature.signer.publicKey,
            txWithSignature.type,
            txWithSignature.networkType
        );
    }

    public async announceTxWithCosignatures(
        signedTx: SignedTransaction,
        cosignatures: CosignatureSignedTransaction[],
    ) {
        // DO NOT modify the transaction!
        const completeSignedTx = SymbolService.createSignedTxWithCosignatures(
            signedTx,
            cosignatures
        );

        return this.announceTx(completeSignedTx).then((res) => res.message);
    }

    // Returns:
    //   - txs: Array of InnerTransaction
    //   - mosaicId: Generated mosaic ID
    public async createMosaicDefinitionTx(
        creatorPubAccount: PublicAccount,
        durationBlocks: UInt64,
        divisibility: number,
        supplyAmount: number,
        isSupplyMutable: boolean = true,
        isTransferable: boolean = true,
        isRestrictable: boolean = true,
        isRevokable: boolean = false,
    ) {
        const { epochAdjustment, networkType } = await this.getNetwork();

        const nonce = MosaicNonce.createRandom();
        const mosaicId = MosaicId.createFromNonce(nonce, creatorPubAccount.address);
        const txs = new Array<InnerTransaction>();

        txs.push(
            MosaicDefinitionTransaction.create(
                Deadline.create(epochAdjustment, this.config.deadline_hours),
                nonce,
                mosaicId,
                MosaicFlags.create(isSupplyMutable, isTransferable, isRestrictable, isRevokable),
                divisibility,
                durationBlocks,
                networkType,
            ).toAggregate(creatorPubAccount)
        );

        txs.push(
            MosaicSupplyChangeTransaction.create(
                Deadline.create(epochAdjustment, this.config.deadline_hours),
                mosaicId,
                MosaicSupplyChangeAction.Increase,
                UInt64.fromUint(supplyAmount * Math.pow(10, divisibility)),
                networkType,
            ).toAggregate(creatorPubAccount)
        );

        return {
            txs,
            mosaicId,
        };
    }

    // Arguments:
    //   - name: The name can be up to 64 characters long.
    //   - durationBlocks: At least 86400 (30minutes) or long
    public async createNamespaceRegistrationTx(
        ownerPubAccount: PublicAccount,
        name: string,
        durationBlocks: UInt64,
    ) {
        const { epochAdjustment, networkType } = await this.getNetwork();
        return NamespaceRegistrationTransaction.createRootNamespace(
            Deadline.create(epochAdjustment, this.config.deadline_hours),
            name,
            durationBlocks,
            networkType,
        ).toAggregate(ownerPubAccount);
    }

    // When type is mosaic: targetAccount must be mosaic creator
    // When type is namespace: targetAccount must be namespace owner
    public async createMetadataTx(
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId | string,
        key: string | UInt64,
        value: string | Uint8Array,
        sizeDelta?: number,
    ) {
        const { epochAdjustment, networkType } = await this.getNetwork();
        const valueBytes = typeof(value) === "string" ? Convert.utf8ToUint8(value) : value;
        const actualKey = typeof(key) === "string" ? SymbolService.generateKey(key) : key;
        const actualSizeDelta = sizeDelta === undefined ? valueBytes.length : sizeDelta;

        switch (type) {
            case MetadataType.Mosaic: {
                return MosaicMetadataTransaction.create(
                    Deadline.create(epochAdjustment, this.config.deadline_hours),
                    targetPubAccount.address,
                    typeof(key) === "string" ? SymbolService.generateKey(key) : key,
                    typeof(targetId) === "string" ? new MosaicId(targetId) : targetId as MosaicId,
                    actualSizeDelta,
                    valueBytes,
                    networkType,
                ).toAggregate(sourcePubAccount);
            }

            case MetadataType.Namespace: {
                return NamespaceMetadataTransaction.create(
                    Deadline.create(epochAdjustment, this.config.deadline_hours),
                    targetPubAccount.address,
                    actualKey,
                    typeof(targetId) === "string" ? new NamespaceId(targetId) : targetId as NamespaceId,
                    actualSizeDelta,
                    valueBytes,
                    networkType,
                ).toAggregate(sourcePubAccount);
            }

            default: {
                return AccountMetadataTransaction.create(
                    Deadline.create(epochAdjustment, this.config.deadline_hours),
                    targetPubAccount.address,
                    actualKey,
                    actualSizeDelta,
                    valueBytes,
                    networkType
                ).toAggregate(sourcePubAccount);
            }
        }
    }

    public async composeAggregateCompleteTx(
        feeMultiplier: number,
        numCosigner: number,
        txs: InnerTransaction[],
    ) {
        const { epochAdjustment, networkType } = await this.getNetwork();
        return AggregateTransaction.createComplete(
            Deadline.create(epochAdjustment, this.config.deadline_hours),
            txs,
            networkType,
            [])
            // Use network transaction fee
            .setMaxFeeForAggregate(feeMultiplier, numCosigner);
    }

    // Returns undefined if tx not found.
    public async getConfirmedTx(txHash: string) {
        const { repositoryFactory } = await this.getNetwork();
        const txHttp = repositoryFactory.createTransactionRepository();

        return firstValueFrom(txHttp.getTransaction(txHash, TransactionGroup.Confirmed))
            .then((tx) => tx.transactionInfo?.hash)
            .catch(() => undefined);
    }

    // Returns undefined if tx not found.
    public async getPartialTx(txHash: string) {
        const { repositoryFactory } = await this.getNetwork();
        const txHttp = repositoryFactory.createTransactionRepository();

        return firstValueFrom(txHttp.getTransaction(txHash, TransactionGroup.Partial))
            .then((tx) => tx.transactionInfo?.hash)
            .catch(() => undefined);
    }

    private async listenTxs(
        listener: IListener,
        account: Account | PublicAccount,
        txHashes: string[],
        group: "confirmed" | "partial" | "all" = "confirmed",
    ) {
        const { repositoryFactory } = await this.getNetwork();
        const statusHttp = repositoryFactory.createTransactionStatusRepository();
        const subscriptions = new Array<Subscription>();

        const promises = txHashes.map((txHash) => new Promise<{ txHash: string, error?: string }>(
            async (resolve, reject) => {
                subscriptions.push(
                    listener.status(account.address, txHash)
                        .subscribe({
                            next: async (value) => {
                                const error = `Received error status: ${value.code}`;
                                Logger.debug(error);
                                resolve({ txHash, error });
                            },
                            error: (e) => {
                                reject(e);
                            }
                        })
                );
                if (["confirmed", "all"].includes(group)) {
                    subscriptions.push(
                        listener.confirmed(account.address, txHash)
                            .subscribe({
                                next: async () => {
                                    resolve({ txHash, error: undefined });
                                },
                                error: (e) => {
                                    reject(e);
                                }
                            })
                    );
                }
                if (["partial", "all"].includes(group)) {
                    subscriptions.push(
                        listener.aggregateBondedAdded(account.address, txHash, true)
                            .subscribe({
                                next: async () => {
                                    resolve({ txHash, error: undefined });
                                },
                                error: (e) => {
                                    reject(e);
                                }
                            })
                    );
                }

                const status = await firstValueFrom(statusHttp.getTransactionStatus(txHash))
                    .catch(() => undefined);
                if (status?.code?.startsWith("Failure")) {
                    // Transaction Failed
                    const error = `Received error status: ${status.code}`;
                    Logger.debug(error);
                    resolve({ txHash, error: error });
                } else if ((["confirmed", "all"].includes(group) && await this.getConfirmedTx(txHash)) ||
                    (["partial", "all"].includes(group) && await this.getPartialTx(txHash))
                ) {
                    // Already confirmed
                    resolve({ txHash, error: undefined });
                }
            })
        );

        return Promise.all(promises)
            .finally(() => {
                subscriptions.forEach((subscription) => subscription.unsubscribe());
            });
    }

    // Wait till tx(s) has been confirmed.
    // Returns:
    //   - Array of results
    public async waitTxsFor(
        account: Account | PublicAccount,
        txHashes?: string | string[],
        group: "confirmed" | "partial" | "all" = "confirmed",
    ) {
        const { repositoryFactory } = await this.getNetwork();
        const listener = repositoryFactory.createListener();
        await listener.open();

        // Wait for all txs in parallel
        return this.listenTxs(listener, account, (typeof(txHashes) === "string" ? [txHashes] : (txHashes || [])), group)
            .finally(() => {
                listener.close();
            });
    }

    // Receive all metadata that are matched criteria
    public async searchMetadata(
        type: MetadataType,
        criteria: {
            target?: Account | PublicAccount | Address,
            source?: Account | PublicAccount | Address,
            key?: string | UInt64,
            targetId?: MosaicId | NamespaceId,
        },
        pageSize: number = 100,
    ) {
        const { repositoryFactory } = await this.getNetwork();
        const metadataHttp = repositoryFactory.createMetadataRepository();

        const searchCriteria: MetadataSearchCriteria = {
            targetAddress: criteria.target && (
                criteria.target instanceof Address ? criteria.target : criteria.target.address
            ),
            sourceAddress: criteria.source && (
                criteria.source instanceof Address ? criteria.source : criteria.source.address
            ),
            scopedMetadataKey: typeof(criteria.key) === "string"
                ? SymbolService.generateKey(criteria.key).toHex()
                : criteria.key?.toHex(),
            targetId: criteria.targetId && criteria.targetId,
            metadataType: type,
            pageSize,
        };

        let batch;
        let pageNumber = 1;
        const metadataPool = new Array<Metadata>();
        do {
            batch = await firstValueFrom(
                metadataHttp.search({ ...searchCriteria, pageNumber: pageNumber++ })
            ).then((page) => page.data);
            metadataPool.push(...batch);
        } while (batch.length === pageSize);

        return metadataPool;
    }

    // Return: Array of signed aggregate complete TX and cosignatures (when cosigners are specified)
    public async buildSignedAggregateCompleteTxBatches(
        txs: InnerTransaction[],
        signerAccount: Account,
        cosignerAccounts?: Account[],
        feeRatio: number = this.config.fee_ratio,
        batchSize: number = this.config.batch_size,
    ) {
        const { networkGenerationHash } = await this.getNetwork();
        const feeMultiplier = await this.getFeeMultiplier(feeRatio);
        const txPool = [ ...txs ];
        const batches = new Array<SignedAggregateTx>();

        do {
            const innerTxs = txPool.splice(0, batchSize);
            const aggregateTx = await this.composeAggregateCompleteTx(
                feeMultiplier,
                cosignerAccounts?.length || 0,
                innerTxs,
            );

            const signedTx = signerAccount.sign(aggregateTx, networkGenerationHash);
            const cosignatures = cosignerAccounts?.map(
                (cosigner) => CosignatureTransaction.signTransactionHash(cosigner, signedTx.hash)
            ) || [];

            batches.push({
                signedTx,
                cosignatures,
                maxFee: aggregateTx.maxFee,
            });
        } while (txPool.length);

        return batches;
    }

    // Announce aggregate TXs in parallel
    // Returns:
    //   - Succeeded: undefined
    //   - Failed: errors
    public async executeBatches(
        batches: SignedAggregateTx[],
        signerAccount: Account | PublicAccount,
        maxParallel: number = this.config.max_parallels,
    ) {
        const txPool = [ ...batches ];
        const workers = new Array<Promise<{txHash: string, error?: string}[] | undefined>>();

        const { repositoryFactory } = await this.getNetwork();
        const listener = repositoryFactory.createListener();
        await listener.open();

        for (let i = 0; i < maxParallel; i++) {
            workers.push(new Promise(async (resolve) => {
                const nextBatch = () => txPool.splice(0, 1).shift();
                for (let batch = nextBatch(); batch; batch = nextBatch()) {
                    await this.announceTxWithCosignatures(batch.signedTx, batch.cosignatures);
                    const errors = (await this.listenTxs(listener, signerAccount, [batch.signedTx.hash], "confirmed"))
                        .filter((result) => result.error);
                    if (errors.length) {
                        resolve(errors);
                    }
                }
                resolve(undefined);
            }));
        }

        return Promise.all(workers)
            .then((workerErrors) => workerErrors
                .filter((error) => error)
                .reduce(
                    (acc, curr) => [ ...(acc || []), ...(curr || []) ],
                    undefined,
                )
            )
            .finally(() => {
                listener.close();
            });
    }

    public async getMetadataByHash(
        compositeHash: string,
    ) {
        const {repositoryFactory} = await this.getNetwork();
        const metadataHttp = repositoryFactory.createMetadataRepository();
        return firstValueFrom(metadataHttp.getMetadata(compositeHash));
    }

}
