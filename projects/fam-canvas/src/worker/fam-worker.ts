import { FamRequestMsg } from "./fam-msg";
import { FamWorkerImpl } from "./fam-impl";

var famWorker: FamWorkerImpl;

// コンパイルエラー対処
declare var postMessage: Function;

addEventListener("message", $event => {
    let req: FamRequestMsg = $event.data;
    if (req) {
        if (req.type == "function") {
            let rom = eval("(" + req.option + ")()");
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
        }
    }
});