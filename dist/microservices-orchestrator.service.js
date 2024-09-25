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
const chalk_1 = __importDefault(require("chalk"));
const dayjs_1 = __importDefault(require("dayjs"));
let MicroservicesOrchestratorService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MicroservicesOrchestratorService = _classThis = class {
        constructor() { }
        // Funzione per creare la struttura dei log come NestJS
        log(message, context, duration = '+0ms') {
            const timestamp = (0, dayjs_1.default)().format('MM/DD/YYYY, h:mm:ss A');
            const formattedMessage = chalk_1.default.green(message);
            console.log(chalk_1.default.cyan(`[Orchestrator] 29 - ${timestamp}     LOG `) +
                chalk_1.default.yellow(`[${context}] `) +
                formattedMessage +
                chalk_1.default.magenta(` ${duration}`));
        }
        // Funzione per verificare la prontezza delle dipendenze
        async areDependenciesReady(serviceName, options = {}) {
            this.log(`Inizio controllo delle dipendenze per il servizio: ${serviceName}`, 'OrchestratorService');
            const MAX_RETRIES = options.retry || 5;
            const RETRY_DELAY = options.retryDelays || 3000;
            // Crea il client Redis
            const redisClient = new ioredis_1.default({
                host: options.redisServiceHost || 'redis',
                port: typeof options.redisServicePort === 'string' ? parseInt(options.redisServicePort, 10) : options.redisServicePort || 6379,
            });
            // Verifica la connessione a Redis
            this.log('Verifica connessione a Redis...', 'OrchestratorService');
            await this.checkRedisConnection(redisClient, MAX_RETRIES, RETRY_DELAY);
            // Ottieni le dipendenze
            const dependencies = JSON.parse(process.env[`${serviceName.toUpperCase()}_DEPENDENCIES`] || '[]');
            this.log(`Dipendenze trovate: ${dependencies}`, 'OrchestratorService');
            // Se non ci sono dipendenze, il servizio può partire dopo la connessione a Redis
            if (dependencies.length === 0) {
                this.log('Nessuna dipendenza trovata, il servizio può partire...', 'OrchestratorService');
                return;
            }
            // Crea un set per tenere traccia delle dipendenze pronte
            const resolvedDependencies = new Set();
            let readyCount = 0;
            // Sottoscrivi al canale Redis per ascoltare quando le dipendenze sono pronte
            const redisChannel = 'service_ready';
            redisClient.subscribe(redisChannel, (err) => {
                if (err) {
                    console.error(chalk_1.default.red('[Orchestrator] Errore nella sottoscrizione al canale Redis:', err));
                }
                else {
                    this.log(`Sottoscritto al canale ${redisChannel}`, 'OrchestratorService');
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
                            this.log(`Dipendenza pronta: ${dependency}. Pronte ${readyCount}/${dependencies.length}`, 'OrchestratorService');
                            if (readyCount === dependencies.length) {
                                clearTimeout(timeout);
                                this.log('Tutte le dipendenze sono pronte!', 'OrchestratorService');
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
            this.log(`Notifica che il servizio ${serviceName} è pronto...`, 'OrchestratorService');
            redisClient.publish(redisChannel, `${serviceName}_ready`, (err, reply) => {
                if (err) {
                    console.error(chalk_1.default.red(`[Orchestrator] Errore durante la pubblicazione del messaggio su Redis: ${err.message}`));
                }
                else {
                    this.log(`Messaggio pubblicato con successo su Redis. Risposta: ${reply}`, 'OrchestratorService');
                }
                redisClient.quit();
            });
        }
        // Funzione per controllare la connessione a Redis
        async checkRedisConnection(redisClient, maxRetries, retryDelay) {
            let retries = 0;
            while (retries < maxRetries) {
                try {
                    this.log(`Tentativo di connessione a Redis (${retries + 1}/${maxRetries})...`, 'OrchestratorService');
                    await redisClient.ping();
                    this.log('Redis è pronto!', 'OrchestratorService');
                    return;
                }
                catch (err) {
                    retries++;
                    this.log(`Connessione a Redis fallita, tentativo ${retries}/${maxRetries}`, 'OrchestratorService');
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
