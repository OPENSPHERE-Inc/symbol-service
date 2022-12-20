import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {Account, Address, AggregateTransaction, Convert, UInt64} from "symbol-sdk";
import {SymbolService} from "../services";
import {SymbolTest} from "./utils";


describe("Common", () => {
    let targetAccount: Account;
    let symbolService: SymbolService;

    beforeAll(async () => {
        symbolService = SymbolTest.init();

        const { networkType } = await symbolService.getNetwork();
        targetAccount = Account.generateNewAccount(networkType);
        console.log(`target.address=${targetAccount.address.plain()}`);
    });

    it("isAddress", () => {
        expect(SymbolService.isAddress(targetAccount.address)).toBeTruthy();
        expect(SymbolService.isAddress(targetAccount.publicAccount)).toBeFalsy();

        class ExAddress extends Address {
            constructor() {
                super();
            }
        }

        expect(SymbolService.isAddress(new ExAddress())).toBeTruthy();
    });

    it("isUInt64", () => {
        expect(SymbolService.isUInt64(UInt64.fromUint(0))).toBeTruthy();
        expect(SymbolService.isUInt64("0")).toBeFalsy();

        class ExUInt64 extends UInt64 {
            constructor() {
                super([0, 0]);
            }
        }

        expect(SymbolService.isUInt64(new ExUInt64())).toBeTruthy();
    });

    it("signTx, convertSingedTx", async () => {
       const { signerAccount: senderAccount, payerAccount: recipientAccount } = await SymbolTest.getNamedAccounts();

       const transferTx = await symbolService.createTransferTx(
           senderAccount.publicAccount,
           recipientAccount.address,
           UInt64.fromUint(1000000),
           "test1message"
       );

       const aggregateTx = await symbolService.composeAggregateCompleteTx(
           await symbolService.getFeeMultiplier(),
           0,
           [ transferTx ],
       );

       const { signature, hash, payload, signedTx } = await symbolService.signTx(senderAccount, aggregateTx);

        expect(payload).toBe(signedTx.payload);
        expect(hash).toBe(signedTx.hash);

        const aggregateTxWithSignature = AggregateTransaction.createFromPayload(payload);

        expect(aggregateTxWithSignature.signature).toBe(Convert.uint8ToHex(signature));

        const convertedSignedTx = await symbolService.convertToSignedTx(aggregateTxWithSignature);

        expect(convertedSignedTx).toStrictEqual(signedTx);
    }, 600000);

});