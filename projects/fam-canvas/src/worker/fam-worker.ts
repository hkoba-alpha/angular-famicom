import { FamRequestMsg } from "./fam-msg";
import { FamWorkerImpl } from "./fam-impl";
import { FamUtil } from './fam-util';

class MyTest {

}
class MyTest2 extends MyTest {
    constructor() {
        super();
    }
}

var famWorker: FamWorkerImpl;

// コンパイルエラー対処
declare var postMessage: Function;

self["__extends"] = /*(undefined && undefined.__extends) || */(function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();

addEventListener("message", $event => {
    let req: FamRequestMsg = $event.data;
    if (req) {
        if (req.type == "function") {
            // TODO 強引
            /*
            let code = req.option;
            let res = /([a-zA-Z_0-9]+)\[\"FamUtil\"\]/.exec(code);
            if (res && res.length > 1) {
                self[res[1]] = { FamUtil: FamUtil};
            }
            */
            self["FamUtil"] = new FamUtil();
            let rom = eval("(" + req.option + ")(FamUtil)");
            console.log(rom);
            famWorker = new FamWorkerImpl(rom);
        } else if (req.type == "shutdown") {
            self.close();
        } else if (req.type == "frame" || req.type == "skip-frame") {
            if (famWorker) {
                let res = famWorker.execute(req);
                if (res.screen) {
                    postMessage(res, [res.screen.buffer]);
                } else {
                    postMessage(res);
                }
            }
        } else if (req.type == "reset") {
            if (famWorker) {
                famWorker.reset();
            }
        } else if (req.type == "param") {
            if (famWorker) {
                famWorker.execute(req);
            }
        }
    }
});