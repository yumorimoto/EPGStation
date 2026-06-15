import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReserveHistory1716647383636 implements MigrationInterface {
    name = 'AddReserveHistory1716647383636';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            'CREATE TABLE "reserve_history" ("id" integer PRIMARY KEY NOT NULL, "updateTime" bigint NOT NULL, "ruleId" integer, "ruleUpdateCnt" integer, "isSkip" boolean NOT NULL DEFAULT (0), "isConflict" boolean NOT NULL DEFAULT (0), "allowEndLack" boolean NOT NULL DEFAULT (0), "tags" text, "isOverlap" boolean NOT NULL DEFAULT (0), "isIgnoreOverlap" boolean NOT NULL DEFAULT (0), "isTimeSpecified" boolean NOT NULL DEFAULT (0), "isEventRelay" boolean NOT NULL DEFAULT (0), "parentDirectoryName" text, "directory" text, "recordedFormat" text, "encodeMode1" text, "encodeParentDirectoryName1" text, "encodeDirectory1" text, "encodeMode2" text, "encodeParentDirectoryName2" text, "encodeDirectory2" text, "encodeMode3" text, "encodeParentDirectoryName3" text, "encodeDirectory3" text, "isDeleteOriginalAfterEncode" boolean NOT NULL DEFAULT (0), "programId" bigint, "programUpdateTime" bigint, "channelId" bigint NOT NULL, "channel" text NOT NULL, "channelType" text NOT NULL, "startAt" bigint NOT NULL, "endAt" bigint NOT NULL, "name" text, "halfWidthName" text, "shortName" text, "description" text, "halfWidthDescription" text, "extended" text, "halfWidthExtended" text, "rawExtended" text, "rawHalfWidthExtended" text, "genre1" integer, "subGenre1" integer, "genre2" integer, "subGenre2" integer, "genre3" integer, "subGenre3" integer, "videoType" text, "videoResolution" text, "videoStreamContent" integer, "videoComponentType" integer, "audioSamplingRate" integer, "audioComponentType" integer)',
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE "reserve_history"');
    }
}
