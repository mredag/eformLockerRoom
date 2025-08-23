pi@pi-eform-locker:~/eform-locker $ npm run build

> eform-locker-system@1.0.0 build
> npm run build --workspaces


> @eform/gateway@1.0.0 build
> esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js --external:sqlite3


  dist/index.js  1.4mb ⚠️

⚡ Done in 86ms

> @eform/kiosk@1.0.0 build
> esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js --external:sqlite3 --external:serialport --external:node-hid --external:@fastify/static


  dist/index.js  1.4mb ⚠️

⚡ Done in 103ms

> @eform/panel@1.0.0 build
> esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js --external:sqlite3 --external:@mapbox/node-pre-gyp --external:mock-aws-s3 --external:aws-sdk --external:nock --format=esm


  dist/index.js  1.7mb ⚠️

⚡ Done in 143ms

> eform-agent@1.0.0 build
> esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js --format=cjs --external:sqlite3

▲ [WARNING] Import "UpdateAgent" will always be undefined because the file "src/services/update-agent.js" has no exports [import-is-undefined]

    src/index.ts:3:9:
      3 │ import { UpdateAgent } from './services/update-agent.js';
        ╵          ~~~~~~~~~~~

1 warning

  dist/index.js  632b

⚡ Done in 2ms

> @eform/shared@1.0.0 build
> tsc

controllers/__tests__/health-controller.test.ts:101:14 - error TS18048: 'result.details' is possibly 'undefined'.

101       expect(result.details.error).toBe('Health check failed');
                 ~~~~~~~~~~~~~~

database/__tests__/command-queue-repository.test.ts:4:53 - error TS6059: File '/home/pi/eform-locker/src/types/core-entities.ts' is not under 'rootDir' '/home/pi/eform-locker/shared'. 'rootDir' is expected to contain all source files.
  The file is in the program because:
    Imported via '../../../src/types/core-entities.js' from file '/home/pi/eform-locker/shared/database/__tests__/command-queue-repository.test.ts'
    Imported via '../../../src/types/core-entities' from file '/home/pi/eform-locker/shared/database/__tests__/locker-repository.test.ts'
    Imported via '../../../src/types/core-entities' from file '/home/pi/eform-locker/shared/services/__tests__/command-queue-manager.test.ts'
    Imported via '../../../src/types/core-entities' from file '/home/pi/eform-locker/shared/services/__tests__/event-logger.test.ts'

4 import { Command, CommandType, CommandStatus } from '../../../src/types/core-entities.js';
                                                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  database/__tests__/locker-repository.test.ts:5:38
    5 import { Locker, LockerStatus } from '../../../src/types/core-entities';
                                           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    File is included via import here.
  services/__tests__/command-queue-manager.test.ts:4:44
    4 import { CommandType, CommandStatus } from '../../../src/types/core-entities';
                                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    File is included via import here.
  services/__tests__/event-logger.test.ts:4:27
    4 import { EventType } from '../../../src/types/core-entities';
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    File is included via import here.

database/__tests__/command-queue-repository.test.ts:4:53 - error TS6307: File '/home/pi/eform-locker/src/types/core-entities.ts' is not listed within the file list of project '/home/pi/eform-locker/shared/tsconfig.json'. Projects must list all files or use an 'include' pattern.
  The file is in the program because:
    Imported via '../../../src/types/core-entities.js' from file '/home/pi/eform-locker/shared/database/__tests__/command-queue-repository.test.ts'
    Imported via '../../../src/types/core-entities' from file '/home/pi/eform-locker/shared/database/__tests__/locker-repository.test.ts'
    Imported via '../../../src/types/core-entities' from file '/home/pi/eform-locker/shared/services/__tests__/command-queue-manager.test.ts'
    Imported via '../../../src/types/core-entities' from file '/home/pi/eform-locker/shared/services/__tests__/event-logger.test.ts'

4 import { Command, CommandType, CommandStatus } from '../../../src/types/core-entities.js';
                                                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  database/__tests__/locker-repository.test.ts:5:38
    5 import { Locker, LockerStatus } from '../../../src/types/core-entities';
                                           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    File is included via import here.
  services/__tests__/command-queue-manager.test.ts:4:44
    4 import { CommandType, CommandStatus } from '../../../src/types/core-entities';
                                                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    File is included via import here.
  services/__tests__/event-logger.test.ts:4:27
    4 import { EventType } from '../../../src/types/core-entities';
                                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    File is included via import here.

database/__tests__/command-queue-repository.test.ts:217:46 - error TS2345: Argument of type 'Omit<import("/home/pi/eform-locker/src/types/core-entities").Command, "created_at">' is not assignable to parameter of type 'Omit<import("/home/pi/eform-locker/shared/types/core-entities").Command, "created_at">'.
  Property 'version' is missing in type 'Omit<import("/home/pi/eform-locker/src/types/core-entities").Command, "created_at">' but required in type 'Omit<import("/home/pi/eform-locker/shared/types/core-entities").Command, "created_at">'.

217       const result = await repository.create(newCommand);
                                                 ~~~~~~~~~~

  types/core-entities.ts:227:3
    227   version: number; // For optimistic locking
          ~~~~~~~
    'version' is declared here.

database/__tests__/command-queue-repository.test.ts:256:38 - error TS2345: Argument of type 'Omit<import("/home/pi/eform-locker/src/types/core-entities").Command, "created_at">' is not assignable to parameter of type 'Omit<import("/home/pi/eform-locker/shared/types/core-entities").Command, "created_at">'.
  Property 'version' is missing in type 'Omit<import("/home/pi/eform-locker/src/types/core-entities").Command, "created_at">' but required in type 'Omit<import("/home/pi/eform-locker/shared/types/core-entities").Command, "created_at">'.

256       await expect(repository.create(newCommand)).rejects.toThrow('Failed to create command');
                                         ~~~~~~~~~~

  types/core-entities.ts:227:3
    227   version: number; // For optimistic locking
          ~~~~~~~
    'version' is declared here.

database/__tests__/locker-repository.test.ts:118:10 - error TS2554: Expected 3 arguments, but got 4.

118       }, locker.version);
             ~~~~~~~~~~~~~~

database/__tests__/locker-repository.test.ts:136:65 - error TS2554: Expected 3 arguments, but got 4.

136         repository.update('kiosk-1', 1, { status: 'Reserved' }, 999)
                                                                    ~~~

database/__tests__/locker-repository.test.ts:142:67 - error TS2554: Expected 3 arguments, but got 4.

142         repository.update('kiosk-1', 999, { status: 'Reserved' }, 1)
                                                                      ~

services/__tests__/event-logger.test.ts:131:60 - error TS2345: Argument of type '{}' is not assignable to parameter of type '{ previous_status: string; burst_required: boolean; assignment_duration_ms?: number | undefined; }'.
  Type '{}' is missing the following properties from type '{ previous_status: string; burst_required: boolean; assignment_duration_ms?: number | undefined; }': previous_status, burst_required

131         eventLogger.logRfidAssign('kiosk-1', 5, 'card123', {
                                                               ~
132           // Missing required fields
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
133         })
    ~~~~~~~~~

services/__tests__/hardware-soak-tester.test.ts:31:47 - error TS2345: Argument of type '{ lastID: number; changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ lastID: number; changes: number; }' is missing the following properties from type 'RunResult': bind, reset, finalize, run, and 18 more.

31       vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
                                                 ~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/hardware-soak-tester.test.ts:74:47 - error TS2345: Argument of type '{ lastID: number; changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ lastID: number; changes: number; }' is missing the following properties from type 'RunResult': bind, reset, finalize, run, and 18 more.

74       vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
                                                 ~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/hardware-soak-tester.test.ts:85:47 - error TS2345: Argument of type '{ lastID: number; changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ lastID: number; changes: number; }' is missing the following properties from type 'RunResult': bind, reset, finalize, run, and 18 more.

85       vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
                                                 ~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/hardware-soak-tester.test.ts:100:47 - error TS2345: Argument of type '{ lastID: number; changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ lastID: number; changes: number; }' is missing the following properties from type 'RunResult': bind, reset, finalize, run, and 18 more.

100       vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/hardware-soak-tester.test.ts:134:47 - error TS2345: Argument of type '{ lastID: number; changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ lastID: number; changes: number; }' is missing the following properties from type 'RunResult': bind, reset, finalize, run, and 18 more.

134       vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/hardware-soak-tester.test.ts:302:47 - error TS2345: Argument of type '{ lastID: number; changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ lastID: number; changes: number; }' is missing the following properties from type 'RunResult': bind, reset, finalize, run, and 18 more.

302       vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/hardware-soak-tester.test.ts:356:47 - error TS2345: Argument of type '{ lastID: number; changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ lastID: number; changes: number; }' is missing the following properties from type 'RunResult': bind, reset, finalize, run, and 18 more.

356       vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/hardware-soak-tester.test.ts:372:47 - error TS2345: Argument of type '{ lastID: number; changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ lastID: number; changes: number; }' is missing the following properties from type 'RunResult': bind, reset, finalize, run, and 18 more.

372       vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/hardware-soak-tester.test.ts:443:47 - error TS2345: Argument of type '{ lastID: number; changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ lastID: number; changes: number; }' is missing the following properties from type 'RunResult': bind, reset, finalize, run, and 18 more.

443       vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/health-monitor.test.ts:82:14 - error TS18048: 'health.details' is possibly 'undefined'.

82       expect(health.details.database).toEqual({
                ~~~~~~~~~~~~~~

services/__tests__/i18n-regression.test.ts:121:13 - error TS2554: Expected 1 arguments, but got 2.

121             `Parameter ${param} missing in Turkish message ${key}`);
                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/i18n-regression.test.ts:123:13 - error TS2554: Expected 1 arguments, but got 2.

123             `Parameter ${param} missing in English message ${key}`);
                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/i18n-regression.test.ts:143:19 - error TS2554: Expected 1 arguments, but got 2.

143                   `Unknown parameter ${param} in ${sectionName}.${key} (${language})`);
                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/i18n-regression.test.ts:177:19 - error TS2554: Expected 1 arguments, but got 2.

177                   `Placeholder text found in ${sectionName}.${key} (${language}): "${message}"`);
                      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/i18n-regression.test.ts:200:17 - error TS2554: Expected 1 arguments, but got 2.

200                 `Message too long in ${sectionName}.${key} (${language}): ${message.length} chars`);
                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/i18n-regression.test.ts:220:17 - error TS2554: Expected 1 arguments, but got 2.

220                 `Empty or whitespace-only message in ${sectionName}.${key} (${language})`);
                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/i18n-regression.test.ts:334:43 - error TS2345: Argument of type '{ id: any; wrongParam?: undefined; } | { wrongParam: string; id?: undefined; } | { id?: undefined; wrongParam?: undefined; }' is not assignable to parameter of type 'MessageParams | undefined'.
  Type '{ id: any; wrongParam?: undefined; }' is not assignable to type 'MessageParams'.
    Property 'wrongParam' is incompatible with index signature.
      Type 'undefined' is not assignable to type 'string | number'.

334         expect(() => i18nService.get(key, params)).not.toThrow();
                                              ~~~~~~

services/__tests__/i18n-regression.test.ts:335:45 - error TS2345: Argument of type '{ id: any; wrongParam?: undefined; } | { wrongParam: string; id?: undefined; } | { id?: undefined; wrongParam?: undefined; }' is not assignable to parameter of type 'MessageParams | undefined'.
  Type '{ id: any; wrongParam?: undefined; }' is not assignable to type 'MessageParams'.
    Property 'wrongParam' is incompatible with index signature.
      Type 'undefined' is not assignable to type 'string | number'.

335         const result = i18nService.get(key, params);
                                                ~~~~~~

services/__tests__/i18n-service.test.ts:270:11 - error TS2554: Expected 1 arguments, but got 2.

270           `Parameter mismatch in ${messageKey}: TR has ${trParams.join(', ')}, EN has ${enParams.join(', ')}`);
              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/i18n-service.test.ts:281:49 - error TS2554: Expected 1 arguments, but got 2.

281             expect(typeof value).toBe('string', `${sectionName}.${key} should be a string in ${language}`);
                                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/i18n-service.test.ts:283:15 - error TS2554: Expected 1 arguments, but got 2.

283               `${sectionName}.${key} should not be empty in ${language}`);
                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

services/__tests__/locker-state-manager.test.ts:169:34 - error TS2571: Object is of type 'unknown'.

169       const details = JSON.parse(events[0].details);
                                     ~~~~~~~~~

services/__tests__/locker-state-manager.test.ts:234:34 - error TS2571: Object is of type 'unknown'.

234       const details = JSON.parse(events[0].details);
                                     ~~~~~~~~~

services/__tests__/locker-state-manager.test.ts:318:34 - error TS2571: Object is of type 'unknown'.

318       const details = JSON.parse(events[0].details);
                                     ~~~~~~~~~

services/__tests__/locker-state-manager.test.ts:402:34 - error TS2571: Object is of type 'unknown'.

402       const details = JSON.parse(events[0].details);
                                     ~~~~~~~~~

services/__tests__/log-retention-manager.test.ts:51:32 - error TS2345: Argument of type '{ changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ changes: number; }' is missing the following properties from type 'RunResult': lastID, bind, reset, finalize, and 19 more.

51         .mockResolvedValueOnce({ changes: 50 }) // regular events
                                  ~~~~~~~~~~~~~~~

services/__tests__/log-retention-manager.test.ts:52:32 - error TS2345: Argument of type '{ changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ changes: number; }' is missing the following properties from type 'RunResult': lastID, bind, reset, finalize, and 19 more.

52         .mockResolvedValueOnce({ changes: 10 }) // audit events
                                  ~~~~~~~~~~~~~~~

services/__tests__/log-retention-manager.test.ts:53:32 - error TS2345: Argument of type '{ changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ changes: number; }' is missing the following properties from type 'RunResult': lastID, bind, reset, finalize, and 19 more.

53         .mockResolvedValueOnce({ changes: 5 }); // anonymization updates
                                  ~~~~~~~~~~~~~~

services/__tests__/log-retention-manager.test.ts:116:32 - error TS2345: Argument of type '{ changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ changes: number; }' is missing the following properties from type 'RunResult': lastID, bind, reset, finalize, and 19 more.

116         .mockResolvedValueOnce({ changes: 100 }) // regular events
                                   ~~~~~~~~~~~~~~~~

services/__tests__/log-retention-manager.test.ts:117:32 - error TS2345: Argument of type '{ changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ changes: number; }' is missing the following properties from type 'RunResult': lastID, bind, reset, finalize, and 19 more.

117         .mockResolvedValueOnce({ changes: 25 }); // audit events
                                   ~~~~~~~~~~~~~~~

services/__tests__/log-retention-manager.test.ts:188:47 - error TS2345: Argument of type '{ changes: number; }' is not assignable to parameter of type 'RunResult'.
  Type '{ changes: number; }' is missing the following properties from type 'RunResult': lastID, bind, reset, finalize, and 19 more.

188       vi.mocked(mockDb.run).mockResolvedValue({ changes: 1 });
                                                  ~~~~~~~~~~~~~~

services/__tests__/rate-limiter.test.ts:266:34 - error TS2339: Property 'createEvent' does not exist on type 'EventRepository'.

266       expect(mockEventRepository.createEvent).toHaveBeenCalledWith(
                                     ~~~~~~~~~~~

services/__tests__/security-validation.test.ts:410:57 - error TS2345: Argument of type 'null' is not assignable to parameter of type 'string'.

410       expect(() => validator.generateHmacToken(payload, invalidSecret)).not.toThrow();
                                                            ~~~~~~~~~~~~~

services/__tests__/security-validation.test.ts:411:68 - error TS2345: Argument of type 'null' is not assignable to parameter of type 'string'.

411       expect(() => validator.validateHmacToken('invalid', payload, invalidSecret)).not.toThrow();
                                                                       ~~~~~~~~~~~~~

services/hardware-soak-tester.ts:163:18 - error TS18046: 'row' is of type 'unknown'.

163       locker_id: row.locker_id,
                     ~~~

services/hardware-soak-tester.ts:164:19 - error TS18046: 'row' is of type 'unknown'.

164       test_count: row.test_count,
                      ~~~

services/hardware-soak-tester.ts:165:21 - error TS18046: 'row' is of type 'unknown'.

165       total_cycles: row.total_cycles,
                        ~~~

services/hardware-soak-tester.ts:166:24 - error TS18046: 'row' is of type 'unknown'.

166       total_successes: row.total_successes,
                           ~~~

services/hardware-soak-tester.ts:167:23 - error TS18046: 'row' is of type 'unknown'.

167       total_failures: row.total_failures,
                          ~~~

services/hardware-soak-tester.ts:168:22 - error TS18046: 'row' is of type 'unknown'.

168       success_rate: (row.total_successes / row.total_cycles) * 100,
                         ~~~

services/hardware-soak-tester.ts:168:44 - error TS18046: 'row' is of type 'unknown'.

168       success_rate: (row.total_successes / row.total_cycles) * 100,
                                               ~~~

services/hardware-soak-tester.ts:169:29 - error TS18046: 'row' is of type 'unknown'.

169       avg_response_time_ms: row.avg_response_time,
                                ~~~

services/hardware-soak-tester.ts:170:32 - error TS18046: 'row' is of type 'unknown'.

170       last_test_date: new Date(row.last_test_date),
                                   ~~~

services/log-retention-manager.ts:272:53 - error TS18046: 'record' is of type 'unknown'.

272       const anonymizedCard = this.hashSensitiveData(record.rfid_card);
                                                        ~~~~~~

services/log-retention-manager.ts:276:26 - error TS18046: 'record' is of type 'unknown'.

276         [anonymizedCard, record.id]
                             ~~~~~~

services/log-retention-manager.ts:309:36 - error TS18046: 'record' is of type 'unknown'.

309         const details = JSON.parse(record.details || '{}');
                                       ~~~~~~

services/log-retention-manager.ts:316:39 - error TS18046: 'record' is of type 'unknown'.

316             [JSON.stringify(details), record.id]
                                          ~~~~~~

services/log-retention-manager.ts:380:39 - error TS2339: Property 'count' does not exist on type '{}'.

380     stats.total_events = totalResult?.count || 0;
                                          ~~~~~

services/log-retention-manager.ts:405:50 - error TS2339: Property 'count' does not exist on type '{}'.

405       stats.events_by_age[range.label] = result?.count || 0;
                                                     ~~~~~

services/log-retention-manager.ts:417:50 - error TS2339: Property 'count' does not exist on type '{}'.

417     stats.anonymized_records = anonymizedResult?.count || 0;
                                                     ~~~~~

services/log-retention-manager.ts:427:51 - error TS2339: Property 'count' does not exist on type '{}'.

427     stats.estimated_cleanup_size = cleanupResult?.count || 0;
                                                      ~~~~~

services/log-retention-manager.ts:491:18 - error TS18046: 'record' is of type 'unknown'.

491       timestamp: record.timestamp,
                     ~~~~~~

services/log-retention-manager.ts:492:17 - error TS18046: 'record' is of type 'unknown'.

492       kiosk_id: record.kiosk_id,
                    ~~~~~~

services/log-retention-manager.ts:493:18 - error TS18046: 'record' is of type 'unknown'.

493       locker_id: record.locker_id,
                     ~~~~~~

services/log-retention-manager.ts:494:19 - error TS18046: 'record' is of type 'unknown'.

494       event_type: record.event_type,
                      ~~~~~~

services/log-retention-manager.ts:495:18 - error TS18046: 'record' is of type 'unknown'.

495       rfid_card: record.rfid_card,
                     ~~~~~~

services/log-retention-manager.ts:496:18 - error TS18046: 'record' is of type 'unknown'.

496       device_id: record.device_id,
                     ~~~~~~

services/log-retention-manager.ts:497:19 - error TS18046: 'record' is of type 'unknown'.

497       staff_user: record.staff_user,
                      ~~~~~~

services/log-retention-manager.ts:498:47 - error TS18046: 'record' is of type 'unknown'.

498       details: this.anonymizeDetailsForExport(record.details)
                                                  ~~~~~~


Found 68 errors in 14 files.

Errors  Files
     1  controllers/__tests__/health-controller.test.ts:101
     4  database/__tests__/command-queue-repository.test.ts:4
     3  database/__tests__/locker-repository.test.ts:118
     1  services/__tests__/event-logger.test.ts:131
     9  services/__tests__/hardware-soak-tester.test.ts:31
     1  services/__tests__/health-monitor.test.ts:82
     8  services/__tests__/i18n-regression.test.ts:121
     3  services/__tests__/i18n-service.test.ts:270
     4  services/__tests__/locker-state-manager.test.ts:169
     6  services/__tests__/log-retention-manager.test.ts:51
     1  services/__tests__/rate-limiter.test.ts:266
     2  services/__tests__/security-validation.test.ts:410
     9  services/hardware-soak-tester.ts:163
    16  services/log-retention-manager.ts:272
npm error Lifecycle script `build` failed with error:
npm error code 2
npm error path /home/pi/eform-locker/shared
npm error workspace @eform/shared@1.0.0
npm error location /home/pi/eform-locker/shared
npm error command failed
npm error command sh -c tsc