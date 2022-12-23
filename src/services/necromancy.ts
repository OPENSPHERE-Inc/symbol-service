import {
    Account,
    AggregateTransaction,
    Convert,
    CosignatureSignedTransaction, CosignatureTransaction,
    Deadline,
    InnerTransaction,
    MetadataType,
    PublicAccount,
    UInt64
} from "symbol-sdk";

import {SignedAggregateTx, SymbolService} from "./symbol";
import assert from "assert";
import { v4 as uuidv4 } from "uuid";


export interface UndeadSignature {
    deadline: number;
    hash: string;
    signature: string;
    cosignatures: CosignatureSignedTransaction[];
}

export interface SignedUndeadAggregateTx extends SignedAggregateTx {
    signature: UndeadSignature;
}

export class AggregateUndeadTransaction {
    private static VERSION = "1.0";

    constructor(
        public readonly publicKey: string,
        public readonly aggregateTx: AggregateTransaction,
        public readonly signatures: UndeadSignature[]
    ) {}

    public toJSON() {
        return {
            version: AggregateUndeadTransaction.VERSION,
            publicKey: this.publicKey,
            aggregateTxPayload: this.aggregateTx.serialize(),
            signatures: this.signatures.map((signature) => ({
                ...signature,
                cosignatures: signature.cosignatures.map((cosignature) => ({
                    ...cosignature,
                    // [ lower, higher ]
                    version: cosignature.version.toDTO(),
                }))
            })),
        }
    }

    public static createFromJSON(json: any) {
        if (json.version !== AggregateUndeadTransaction.VERSION) {
            throw new Error(`Version mismatched: ${json.version}`);
        }
        return new AggregateUndeadTransaction(
            json.publicKey,
            AggregateTransaction.createFromPayload(json.aggregateTxPayload),
            json.signatures.map((signature: any) => ({
                ...signature,
                cosignatures: signature.cosignatures.map(
                    (cosignature: any) => new CosignatureSignedTransaction(
                        cosignature.parentHash,
                        cosignature.signature,
                        cosignature.signerPublicKey,
                        // [ lower, higher ]
                        new UInt64(cosignature.version),
                    )
                )
            })),
        );
    }
}

export interface NecromancyServiceConfig {
    deadlineUnitHours: number,
    deadlineMarginHours: number,
}

export class NecromancyService {

    public readonly config: NecromancyServiceConfig  = {
        deadlineUnitHours: 5,
        deadlineMarginHours: 1,
    };

    public constructor(
        private symbolService: SymbolService,
        cfg?: Partial<NecromancyServiceConfig>,
    ) {
        this.config = { ...this.config, ...cfg };
    }

    // cosigners are optional.
    public async createTx(
        deadlineHours: number,
        innerTxs: InnerTransaction[],
        signerAccount: Account,
        cosignerAccounts: Account[] = [],
        feeRatio?: number,
        requiredCosignatures: number = 1,
        nonce: UInt64 = SymbolService.generateKey(uuidv4()),
        timeShiftSecs: number = 0,
    ): Promise<AggregateUndeadTransaction> {
        if (innerTxs.length < 1) {
            throw new Error("Empty inner transactions.");
        }
        if (innerTxs.length > 99) {
            throw new Error("Number of inner transactions must be 99 or less.");
        }

        const { networkType, epochAdjustment } = await this.symbolService.getNetwork();
        const numExtends = Math.ceil(deadlineHours / this.config.deadlineUnitHours);
        const signatures = new Array<UndeadSignature>();
        let firstAggregateTx: AggregateTransaction | undefined;

        // Create lock metadata for prevent duplication
        const lockMetadata = await this.symbolService.createMetadataTx(
            MetadataType.Account,
            signerAccount.publicAccount,
            signerAccount.publicAccount,
            undefined,
            nonce,
            "1",
        );

        for (let i = 0; i < numExtends; i++) {
            const deadline = Deadline.create(
                epochAdjustment + timeShiftSecs,
                Math.min(this.config.deadlineUnitHours * (i + 1), deadlineHours)
            );
            const aggregateTx = AggregateTransaction.createComplete(
                deadline,
                // Insert lock metadata transaction
                [ ...innerTxs, lockMetadata ],
                networkType,
                [],
            ).setMaxFeeForAggregate(await this.symbolService.getFeeMultiplier(feeRatio), requiredCosignatures);

            const { signature, hash } = await this.symbolService.signTx(signerAccount, aggregateTx);
            const cosignatures = cosignerAccounts.map(
                (cosigner) => CosignatureTransaction.signTransactionHash(cosigner, hash)
            );

            signatures.push({
                deadline: deadline.adjustedValue,
                hash,
                signature: Convert.uint8ToHex(signature),
                cosignatures,
            });

            if (!firstAggregateTx) {
                // Save only first life of aggregate tx.
                firstAggregateTx = aggregateTx;
            }
        }

        assert(firstAggregateTx);
        return new AggregateUndeadTransaction(
            signerAccount.publicKey,
            // Clear inner transaction's deadline (because it's garbage)
            AggregateTransaction.createFromPayload(firstAggregateTx.serialize()),
            signatures,
        );
    }

    public cosignTx(
        undeadTx: AggregateUndeadTransaction,
        cosignerAccounts: Account[],
    ): AggregateUndeadTransaction {
        const signatures = new Array<UndeadSignature>();

        for (const signature of undeadTx.signatures) {
            signatures.push({
                ...signature,
                cosignatures: [
                    ...signature.cosignatures,
                    ...cosignerAccounts.map(
                        (cosigner) => CosignatureTransaction.signTransactionHash(cosigner, signature.hash)
                    )
                ],
            })
        }

        return new AggregateUndeadTransaction(
            undeadTx.publicKey,
            undeadTx.aggregateTx,
            signatures,
        );
    }

    // cosigners are optional.
    public async pickAndCastTx(
        undeadTx: AggregateUndeadTransaction,
        cosignerAccounts: Account[] = [],
        timeShiftSecs: number = 0,
    ): Promise<SignedUndeadAggregateTx | undefined> {
        const { epochAdjustment } = await this.symbolService.getNetwork();
        const deadline = Deadline.create(epochAdjustment + timeShiftSecs, this.config.deadlineUnitHours);
        let pickedSignature: UndeadSignature | undefined;
        const marginMsecs = this.config.deadlineMarginHours * 60 * 60 * 1000;

        for (const signature of undeadTx.signatures) {
            if (signature.deadline - marginMsecs > deadline.adjustedValue) {
                break;
            }
            pickedSignature = signature;
        }

        // Convert AggregateTransaction with cosignatures to SignedTransaction
        const toSignedTx = async (aggregateTx: AggregateTransaction, undeadSignature: UndeadSignature) => {
            const cosignatures = cosignerAccounts.map(
                (cosigner) => CosignatureTransaction.signTransactionHash(cosigner, undeadSignature.hash)
            );

            return {
                signedTx: await this.symbolService.convertToSignedTx(new AggregateTransaction(
                    aggregateTx.networkType,
                    aggregateTx.type,
                    aggregateTx.version,
                    Deadline.createFromAdjustedValue(undeadSignature.deadline),
                    aggregateTx.maxFee,
                    aggregateTx.innerTransactions,
                    [],
                    undeadSignature.signature,
                    PublicAccount.createFromPublicKey(undeadTx.publicKey, aggregateTx.networkType),
                )),
                cosignatures: [ ...undeadSignature.cosignatures, ...cosignatures ],
            };
        };

        return pickedSignature && {
            signature: pickedSignature,
            maxFee: undeadTx.aggregateTx.maxFee,
            ...(await toSignedTx(undeadTx.aggregateTx, pickedSignature)),
        };
    }

    public async buildTxBatches(
        deadlineHours: number,
        txs: InnerTransaction[],
        signerAccount: Account,
        cosignerAccounts: Account[] = [],
        feeRatio: number = this.symbolService.config.fee_ratio,
        batchSize: number = this.symbolService.config.batch_size - 1,
        requiredCosignatures: number = 1,
        timeShiftSecs: number = 0,
    ): Promise<AggregateUndeadTransaction[]> {
        if (batchSize > 99) {
            throw new Error("Batch size must be 99 or less.");
        }

        const txPool = [ ...txs ];
        const batches = new Array<AggregateUndeadTransaction>();

        do {
            const innerTxs = txPool.splice(0, batchSize);
            batches.push(await this.createTx(
                deadlineHours,
                innerTxs,
                signerAccount,
                cosignerAccounts,
                feeRatio,
                requiredCosignatures,
                undefined,
                timeShiftSecs,
            ));
        } while (txPool.length);

        return batches;
    }

    public async pickAndCastTxBatches(
        undeadBatches: AggregateUndeadTransaction[],
        cosignerAccounts: Account[] = [],
        timeShiftSecs: number = 0,
    ) {
        return (await Promise.all(
            undeadBatches.map((undeadBatch) =>
                this.pickAndCastTx(undeadBatch, cosignerAccounts, timeShiftSecs)))
        ).map((batch) => {
            if (!batch) {
                throw new Error("Couldn't cast signed transaction.");
            }
            return batch;
        });
    }
}