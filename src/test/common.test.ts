import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {Account, Address, UInt64} from "symbol-sdk";
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

});