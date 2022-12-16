import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {initTestEnv, symbolService, SymbolTest} from "./utils";
import {Account, Convert, Mosaic, MosaicId, UInt64} from "symbol-sdk";
import {sha3_256} from "js-sha3";
import crypto from "crypto";


describe("SecretLock", () => {
    let targetAccount: Account;
    let mosaicId: MosaicId;
    let proof: Uint8Array;
    let secret: Uint8Array;

    beforeAll(async () => {
        initTestEnv();

        const assets = await SymbolTest.generateAssets();
        targetAccount = assets.account;
        mosaicId = assets.mosaicId;
    }, 600000);

    it("SecretLock", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();

        proof = crypto.randomBytes(20);
        secret = Uint8Array.from(sha3_256.create().update(proof).array());
        console.log(`proof=${Convert.uint8ToHex(proof)},secret=${Convert.uint8ToHex(secret)}`);

        const secretLockTx = await symbolService.createSecretLockTx(
            signerAccount.publicAccount,
            targetAccount.address,
            new Mosaic(mosaicId, UInt64.fromUint(3)),
            UInt64.fromUint(Math.floor(600 / 30)),
            secret,
        );

        await SymbolTest.announceAll([ secretLockTx ], signerAccount, []);
    }, 600000);

    it("SecretProof", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();

        const secretProofTx = await symbolService.createSecretProofTx(
            signerAccount.publicAccount,
            targetAccount.address,
            secret,
            proof,
        );

        await SymbolTest.announceAll([ secretProofTx ], signerAccount, []);

        const balance = await symbolService.getAccountBalance(targetAccount.address, mosaicId);

        expect(balance).toStrictEqual(UInt64.fromUint(3));
    }, 600000);

    it("Duplicated SecretLock", async () => {
        const { payerAccount, signerAccount } = await SymbolTest.getNamedAccounts();
        const { networkCurrencyMosaicId } = await symbolService.getNetwork();

        proof = crypto.randomBytes(20);
        secret = Uint8Array.from(sha3_256.create().update(proof).array());
        console.log(`proof=${Convert.uint8ToHex(proof)},secret=${Convert.uint8ToHex(secret)}`);

        // Succeed
        const secretLockTx = await symbolService.createSecretLockTx(
            payerAccount.publicAccount,
            targetAccount.address,
            new Mosaic(networkCurrencyMosaicId, UInt64.fromUint(0)),
            UInt64.fromUint(Math.floor(600 / 30)),
            secret,
        );

        await SymbolTest.announceAll([ secretLockTx ], payerAccount, []);

        // Create duplicated secret lock by another account
        const duplicatedSecretLockTx = await symbolService.createSecretLockTx(
            signerAccount.publicAccount,
            targetAccount.address,
            new Mosaic(networkCurrencyMosaicId, UInt64.fromUint(0)),
            UInt64.fromUint(Math.floor(600 / 30)),
            secret,
        );

        await expect(async () => {
            await SymbolTest.announceAll([ duplicatedSecretLockTx ], signerAccount, []);
        }).rejects.toThrowError();

        // But this will also succeed.
        const anotherSecretLockTx = await symbolService.createSecretLockTx(
            signerAccount.publicAccount,
            payerAccount.address,
            new Mosaic(networkCurrencyMosaicId, UInt64.fromUint(0)),
            UInt64.fromUint(Math.floor(600 / 30)),
            secret,
        );

        await SymbolTest.announceAll([ anotherSecretLockTx ], signerAccount, []);
    }, 600000);

    it("SecretProof by third person", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();

        // Proof payer's secret lock by signer will succeed
        const secretProofTx = await symbolService.createSecretProofTx(
            signerAccount.publicAccount,
            targetAccount.address,
            secret,
            proof,
        );

        await SymbolTest.announceAll([ secretProofTx ], signerAccount, []);
    }, 600000);
});