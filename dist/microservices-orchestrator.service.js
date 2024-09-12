"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicroservicesOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
let MicroservicesOrchestratorService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MicroservicesOrchestratorService = _classThis = class {
        constructor() { }
        // Funzione per attendere che le dipendenze siano pronte con retry e delay personalizzabili
        async areDependenciesReady(serviceName, options = {}) {
            const MAX_RETRIES = options.retry || 5; // Default a 5 se non viene specificato
            const RETRY_DELAY = options.retryDelays || 3000; // Default a 3000ms se non viene specificato
            // Usa i valori forniti negli options, altrimenti default
            const redisClient = new ioredis_1.default({
                host: options.redisServiceHost || 'redis',
                port: parseInt(options.redisServicePort || '6379', 10),
            });
            const redisChannel = 'service_ready';
            // Ottieni la variabile di dipendenze specifica del servizio (es. GATEWAY_DEPENDENCIES)
            const dependencies = JSON.parse(process.env[`${serviceName.toUpperCase()}_DEPENDENCIES`] || '[]');
            let retries = 0;
            let readyCount = 0;
            const promise = new Promise((resolve) => {
                dependencies.forEach((dependency) => {
                    redisClient.subscribe(redisChannel, (err) => {
                        if (err) {
                            console.error('Errore nella sottoscrizione al canale Redis:', err);
                        }
                    });
                    redisClient.on('message', (channel, message) => {
                        if (message === `${dependency}_ready`) {
                            readyCount++;
                            if (readyCount === dependencies.length) {
                                resolve();
                            }
                        }
                    });
                });
                if (dependencies.length === 0) {
                    resolve(); // Se non abbiamo dipendenze, siamo subito pronti
                }
            });
            while (retries < MAX_RETRIES) {
                try {
                    await promise;
                    return; // Tutte le dipendenze sono pronte
                }
                catch (error) {
                    retries++;
                    if (retries >= MAX_RETRIES) {
                        throw new Error(`Le dipendenze non sono pronte dopo ${MAX_RETRIES} tentativi.`);
                    }
                    console.log(`Retrying... tentativo ${retries}`);
                    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
                }
            }
        }
        // Funzione per notificare lo stato di prontezza
        notifyServiceReady(serviceName, options = {}) {
            const redisClient = new ioredis_1.default({
                host: options.redisServiceHost || 'redis',
                port: parseInt(options.redisServicePort || '6379', 10),
            });
            const redisChannel = 'service_ready';
            // Notifica che il servizio è pronto
            redisClient.publish(redisChannel, `${serviceName}_ready`);
        }
    };
    __setFunctionName(_classThis, "MicroservicesOrchestratorService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MicroservicesOrchestratorService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MicroservicesOrchestratorService = _classThis;
})();
exports.MicroservicesOrchestratorService = MicroservicesOrchestratorService;
