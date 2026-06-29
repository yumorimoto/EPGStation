import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReserveHistory1716647383636 implements MigrationInterface {
    name = 'AddReserveHistory1716647383636';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            'CREATE TABLE `reserve_history` (`id` int NOT NULL, `updateTime` bigint NOT NULL, `ruleId` int NULL, `ruleUpdateCnt` int NULL, `isSkip` tinyint NOT NULL DEFAULT 0, `isConflict` tinyint NOT NULL DEFAULT 0, `allowEndLack` tinyint NOT NULL DEFAULT 0, `tags` text NULL, `isOverlap` tinyint NOT NULL DEFAULT 0, `isIgnoreOverlap` tinyint NOT NULL DEFAULT 0, `isTimeSpecified` tinyint NOT NULL DEFAULT 0, `isEventRelay` tinyint NOT NULL DEFAULT 0, `parentDirectoryName` text NULL, `directory` text NULL, `recordedFormat` text NULL, `encodeMode1` text NULL, `encodeParentDirectoryName1` text NULL, `encodeDirectory1` text NULL, `encodeMode2` text NULL, `encodeParentDirectoryName2` text NULL, `encodeDirectory2` text NULL, `encodeMode3` text NULL, `encodeParentDirectoryName3` text NULL, `encodeDirectory3` text NULL, `isDeleteOriginalAfterEncode` tinyint NOT NULL DEFAULT 0, `programId` bigint NULL, `programUpdateTime` bigint NULL, `channelId` bigint NOT NULL, `channel` text NOT NULL, `channelType` text NOT NULL, `startAt` bigint NOT NULL, `endAt` bigint NOT NULL, `name` text NULL, `halfWidthName` text NULL, `shortName` text NULL, `description` text NULL, `halfWidthDescription` text NULL, `extended` text NULL, `halfWidthExtended` text NULL, `rawExtended` text NULL, `rawHalfWidthExtended` text NULL, `genre1` int NULL, `subGenre1` int NULL, `genre2` int NULL, `subGenre2` int NULL, `genre3` int NULL, `subGenre3` int NULL, `videoType` text NULL, `videoResolution` text NULL, `videoStreamContent` int NULL, `videoComponentType` int NULL, `audioSamplingRate` int NULL, `audioComponentType` int NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB',
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE `reserve_history`');
    }
}
