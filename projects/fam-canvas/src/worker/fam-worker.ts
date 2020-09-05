import { FamRequestMsg } from "./fam-msg";
import { FamWorkerImpl, FamStorageBase } from "./fam-impl";
import { FamUtil } from './fam-util';
import { IFamStorage } from "./fam-api";

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

var storageData: {
    key: string;
    resolve: (res: IFamStorage) => void;
};

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
            // TODO
            famWorker = new FamWorkerImpl(rom, (key, size) => {
                return new Promise((resolve, reject) => {
                    storageData = {
                        key: key,
                        resolve: resolve
                    };
                    postMessage({
                        type: "load",
                        key: key,
                        size: size
                    });
                });
            });
        } else if (req.type == "shutdown") {
            if (famWorker) {
                famWorker.shutdown();
            }
            self.close();
        } else if (req.type == "frame" || req.type == "skip-frame") {
            if (famWorker) {
                let res = famWorker.execute(req);
                if (res.screen) {
                    postMessage(res, [res.screen.buffer, res.sound.buffer]);
                    //console.log("POST:FRAME");
                } else {
                    postMessage(res, [res.sound.buffer]);
                    //console.log("POST:SKIP");
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
        } else if (req.type == "storage") {
            // 更新
            if (storageData) {
                storageData.resolve(new class extends FamStorageBase {
                    constructor() {
                        super(req.option);
                    }
                    flushData(data: Uint8Array): void {
                        //let dt = new Uint8Array(data);
                        postMessage({
                            type: "save",
                            key: storageData.key,
                            data: data
                        });
                    }
                });
            }
        }
    }
});