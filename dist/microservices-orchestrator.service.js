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
        // Funzione per verificare la prontezza delle dipendenze
        async areDependenciesReady(serviceName, options = {}) {
            console.log("[Orchestrator] Version 0.4")
            console.log(`[Orchestrator] Inizio controllo delle dipendenze per il servizio: ${serviceName}`);
            const MAX_RETRIES = options.retry || 5;
            const RETRY_DELAY = options.retryDelays || 3000;
            // Crea il client Redis
            const redisClient = new ioredis_1.default({
                host: options.redisServiceHost || 'redis',
                port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
            });
            // Verifica la connessione a Redis
            console.log('[Orchestrator] Verifica connessione a Redis...');
            await this.checkRedisConnection(redisClient, MAX_RETRIES, RETRY_DELAY);
            // Ottieni le dipendenze
            const dependencies = JSON.parse(process.env[`${serviceName.toUpperCase()}_DEPENDENCIES`] || '[]');
            console.log(`[Orchestrator] Dipendenze trovate: ${dependencies}`);
            // Se non ci sono dipendenze, il servizio può partire dopo la connessione a Redis
            if (dependencies.length === 0) {
                console.log('[Orchestrator] Nessuna dipendenza trovata, il servizio può partire...');
                return;
            }
            // Crea un set per tenere traccia delle dipendenze pronte
            const resolvedDependencies = new Set();
            let readyCount = 0;
            // Sottoscrivi al canale Redis per ascoltare quando le dipendenze sono pronte
            const redisChannel = 'service_ready';
            redisClient.subscribe(redisChannel, (err) => {
                if (err) {
                    console.error('[Orchestrator] Errore nella sottoscrizione al canale Redis:', err);
                }
                else {
                    console.log(`[Orchestrator] Sottoscritto al canale ${redisChannel}`);
                }
            });
            return new Promise((resolve, reject) => {
                // Timeout per evitare blocchi infiniti
                const timeout = setTimeout(() => {
                    reject(new Error(`Timeout: non tutte le dipendenze sono pronte dopo ${MAX_RETRIES * RETRY_DELAY} ms.`));
                }, MAX_RETRIES * RETRY_DELAY);
                // Ascolta i messaggi da Redis
                redisClient.on('message', (channel, message) => {
                    dependencies.forEach((dependency) => {
                        if (message === `${dependency}_ready` && !resolvedDependencies.has(dependency)) {
                            resolvedDependencies.add(dependency);
                            readyCount++;
                            console.log(`[Orchestrator] Dipendenza pronta: ${dependency}. Pronte ${readyCount}/${dependencies.length}`);
                            if (readyCount === dependencies.length) {
                                clearTimeout(timeout);
                                console.log('[Orchestrator] Tutte le dipendenze sono pronte!');
                                resolve();
                            }
                        }
                    });
                });
            });
        }
        // Funzione per notificare che il servizio è pronto
        notifyServiceReady(serviceName, options = {}) {
            const redisClient = new ioredis_1.default({
                host: options.redisServiceHost || 'redis',
                port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
            });
            const redisChannel = 'service_ready';
            console.log(`[Orchestrator] Notifica che il servizio ${serviceName} è pronto...`);
            redisClient.publish(redisChannel, `${serviceName}_ready`, (err, reply) => {
                if (err) {
                    console.error(`[Orchestrator] Errore durante la pubblicazione del messaggio su Redis: ${err.message}`);
                }
                else {
                    console.log(`[Orchestrator] Messaggio pubblicato con successo su Redis. Risposta: ${reply}`);
                }
                redisClient.quit();
            });
        }
        // Funzione per controllare la connessione a Redis
        async checkRedisConnection(redisClient, maxRetries, retryDelay) {
            let retries = 0;
            while (retries < maxRetries) {
                try {
                    console.log(`[Orchestrator] Tentativo di connessione a Redis (${retries + 1}/${maxRetries})...`);
                    await redisClient.ping();
                    console.log('[Orchestrator] Redis è pronto!');
                    return;
                }
                catch (err) {
                    retries++;
                    console.error(`[Orchestrator] Connessione a Redis fallita, tentativo ${retries}/${maxRetries}`);
                    if (retries >= maxRetries) {
                        throw new Error('Redis non è disponibile dopo vari tentativi.');
                    }
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                }
            }
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
