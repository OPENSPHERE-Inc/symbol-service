import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {SymbolTest} from "./utils";
import {SymbolService} from "../services";
import {Account, Convert} from "symbol-sdk";


describe("Encryption", () => {
    let targetAccount: Account;
    let symbolService: SymbolService;

    beforeAll(async () => {
        symbolService = SymbolTest.init();

        const { networkType } = await symbolService.getNetwork();
        targetAccount = Account.generateNewAccount(networkType);
        console.log(`target.address=${targetAccount.address.plain()}`);
    });

    it("Encrypt and decrypt", async () => {
        const { signerAccount: senderAccount } = await SymbolTest.getNamedAccounts();

        const plain = Convert.utf8ToUint8("Test text test text 123");
        const encrypted = SymbolService.encryptBinary(plain, senderAccount, targetAccount.publicAccount);

        expect(encrypted.buffer).not.toStrictEqual(plain.buffer);

        const decrypted = SymbolService.decryptBinary(encrypted, senderAccount.publicAccount, targetAccount);

        expect(decrypted.buffer).not.toStrictEqual(encrypted.buffer);
        expect(decrypted.buffer).toStrictEqual(plain.buffer);
    }, 600000);
});