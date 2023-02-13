import "./env";
import {SymbolTest} from "./utils";
import {SymbolService} from "../services";
import {Account, Mosaic, MosaicId, UInt64} from "symbol-sdk";


describe("Transfer", () => {
    let targetAccount: Account;
    let symbolService: SymbolService;
    let mosaicId: MosaicId;

    beforeAll(async () => {
        symbolService = SymbolTest.init();

        const assets = await SymbolTest.generateAssets();
        targetAccount = assets.account;
        mosaicId = assets.mosaicId;
    }, 600000);

    it("Transfer", async () => {
        const { signerAccount: senderAccount, payerAccount } = await SymbolTest.getNamedAccounts();
        const { networkCurrencyMosaicId } = await symbolService.getNetwork();

        const transferTx1 = await symbolService.createTransferTx(
            senderAccount.publicAccount,
            targetAccount.address,
            new Mosaic(mosaicId, UInt64.fromUint(1)),
            "test1message",
        );
        const transferTx2 = await symbolService.createTransferTx(
            payerAccount.publicAccount,
            senderAccount.address,
            UInt64.fromUint(1000000),
            "test2message",
        );
        const transferTx3 = await symbolService.createTransferTx(
            senderAccount.publicAccount,
            payerAccount.address,
            [
                new Mosaic(mosaicId, UInt64.fromUint(1)),
                new Mosaic(networkCurrencyMosaicId, UInt64.fromUint(1000000))
            ],
            "test3message",
        );
        const result = await SymbolTest.doAggregateTx(
            [ transferTx1, transferTx2, transferTx3 ],
            senderAccount,
            [ payerAccount ]
        );

        expect(result?.error).toBeUndefined();

        const balance = await symbolService.getAccountBalance(targetAccount.address, mosaicId);

        expect(balance).toStrictEqual(UInt64.fromUint(1));
    }, 600000);
});