import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MicroservicesOrchestratorService } from './microservices-orchestrator.service';

@Module({
    imports: [ConfigModule.forRoot({
        isGlobal: true,
    })],
    providers: [MicroservicesOrchestratorService],
    exports: [MicroservicesOrchestratorService],
})
export class MicroservicesOrchestratorModule {}
