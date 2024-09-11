import { ConfigService } from '@nestjs/config';
interface RetryOptions {
    retry?: number;
    retryDelays?: number;
}
export declare class MicroservicesOrchestratorService {
    private readonly configService;
    constructor(configService: ConfigService);
    areDependenciesReady(serviceName: string, options?: RetryOptions): Promise<void>;
    notifyServiceReady(serviceName: string): void;
}
export {};
