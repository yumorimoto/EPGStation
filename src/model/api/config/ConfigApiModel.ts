import { inject, injectable } from 'inversify';
import * as apid from '../../../../api';
import IConfiguration from '../../IConfiguration';
import IIPCClient from '../../ipc/IIPCClient';
import ILogger from '../../ILogger';
import ILoggerModel from '../../ILoggerModel';
import IConfigApiModel from './IConfigApiModel';

@injectable()
export default class ConfigApiModel implements IConfigApiModel {
    private configuration: IConfiguration;
    private ipc: IIPCClient;

    private log: ILogger;

    constructor(
        @inject('IConfiguration') configuration: IConfiguration,
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IIPCClient') ipc: IIPCClient,
    ) {
        this.configuration = configuration;
        this.log = logger.getLogger();
        this.ipc = ipc;
    }

    /**
     * コンフィグ設定を返す
     * @param isSecure: boolean https アクセスか?
     */
    public async getConfig(isSecure: boolean): Promise<apid.Config> {
        const config = this.configuration.getConfig();

        const result: apid.Config = <any>{};

        // socket.io ポート設定
        if (typeof config.clientSocketioPort !== 'undefined') {
            result.socketIOPort = config.clientSocketioPort;
        } else if (isSecure === true) {
            // https
            if (typeof config.https === 'undefined') {
                throw new Error('httpsConfigError');
            }

            result.socketIOPort =
                typeof config.https.socketioPort === 'undefined' ? config.https.port : config.https.socketioPort;
        } else {
            // http
            if (typeof config.port === 'undefined') {
                throw new Error('httpConfigError');
            }

            result.socketIOPort = typeof config.socketioPort === 'undefined' ? config.port : config.socketioPort;
        }

        result.recorded = config.recorded.map(r => {
            return r.name;
        });

        result.encode =
            typeof config.encode === 'undefined'
                ? []
                : config.encode.map(e => {
                      return e.name;
                  });

        if (typeof config.urlscheme === 'undefined') {
            this.log.system.error(
                'config.urlscheme is not defined. Ensure your config.yml is up to date with config.yml.template',
            );
        } else {
            if (typeof config.urlscheme.live === 'undefined') {
                this.log.system.error(
                    'config.urlscheme.live is not defined. Ensure your config.yml is up to date with config.yml.template',
                );
            }
            if (typeof config.urlscheme.video === 'undefined') {
                this.log.system.error(
                    'config.urlscheme.video is not defined. Ensure your config.yml is up to date with config.yml.template',
                );
            }
            if (typeof config.urlscheme.download === 'undefined') {
                this.log.system.error(
                    'config.urlscheme.download is not defined. Ensure your config.yml is up to date with config.yml.template',
                );
            }
            // Added optional chaining to fail gracefully if `config.urlscheme.live` does not exist
            result.urlscheme = {
                live: {
                    ios: config.urlscheme.live?.ios,
                    android: config.urlscheme.live?.android,
                    mac: config.urlscheme.live?.mac,
                    win: config.urlscheme.live?.win,
                },
                video: {
                    ios: config.urlscheme.video?.ios,
                    android: config.urlscheme.video?.android,
                    mac: config.urlscheme.video?.mac,
                    win: config.urlscheme.video?.win,
                },
                download: {
                    ios: config.urlscheme.download?.ios,
                    android: config.urlscheme.download?.android,
                    mac: config.urlscheme.download?.mac,
                    win: config.urlscheme.download?.win,
                },
            };
        }

        result.broadcast = await this.ipc.reserveation.getBroadcastStatus();
        result.isEnableTSLiveStream = false;
        result.isEnableTSRecordedStream = false;
        result.isEnableEncodedRecordedStream = false;

        if (typeof config.stream !== 'undefined') {
            result.streamConfig = {};

            // live stream
            if (typeof config.stream.live !== 'undefined') {
                result.streamConfig.live = {};
                if (typeof config.stream.live.ts !== 'undefined') {
                    result.isEnableTSLiveStream = true;
                    result.streamConfig.live.ts = {};

                    if (typeof config.stream.live.ts.m2ts !== 'undefined') {
                        result.streamConfig.live.ts.m2ts = config.stream.live.ts.m2ts.map(c => {
                            return {
                                name: c.name,
                                isUnconverted: typeof c.cmd === 'undefined',
                            };
                        });
                    }
                    if (typeof config.stream.live.ts.m2tsll !== 'undefined') {
                        result.streamConfig.live.ts.m2tsll = config.stream.live.ts.m2tsll.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof config.stream.live.ts.webm !== 'undefined') {
                        result.streamConfig.live.ts.webm = config.stream.live.ts.webm.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof config.stream.live.ts.mp4 !== 'undefined') {
                        result.streamConfig.live.ts.mp4 = config.stream.live.ts.mp4.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof config.stream.live.ts.hls !== 'undefined') {
                        result.streamConfig.live.ts.hls = config.stream.live.ts.hls.map(c => {
                            return c.name;
                        });
                    }
                }
            }

            // recorded stream
            if (typeof config.stream.recorded !== 'undefined') {
                result.streamConfig.recorded = {};
                // ts
                if (typeof config.stream.recorded.ts !== 'undefined') {
                    result.streamConfig.recorded.ts = {};
                    result.isEnableTSRecordedStream = true;
                    if (typeof config.stream.recorded.ts.webm !== 'undefined') {
                        result.streamConfig.recorded.ts.webm = config.stream.recorded.ts.webm.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof config.stream.recorded.ts.mp4 !== 'undefined') {
                        result.streamConfig.recorded.ts.mp4 = config.stream.recorded.ts.mp4.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof config.stream.recorded.ts.hls !== 'undefined') {
                        result.streamConfig.recorded.ts.hls = config.stream.recorded.ts.hls.map(c => {
                            return c.name;
                        });
                    }
                }

                // encoded
                if (typeof config.stream.recorded.encoded !== 'undefined') {
                    result.streamConfig.recorded.encoded = {};
                    result.isEnableEncodedRecordedStream = true;
                    if (typeof config.stream.recorded.encoded.webm !== 'undefined') {
                        result.streamConfig.recorded.encoded.webm = config.stream.recorded.encoded.webm.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof config.stream.recorded.encoded.mp4 !== 'undefined') {
                        result.streamConfig.recorded.encoded.mp4 = config.stream.recorded.encoded.mp4.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof config.stream.recorded.encoded.hls !== 'undefined') {
                        result.streamConfig.recorded.encoded.hls = config.stream.recorded.encoded.hls.map(c => {
                            return c.name;
                        });
                    }
                }
            }
        }

        if (typeof config.kodiHosts !== 'undefined') {
            result.kodiHosts = config.kodiHosts.map(k => {
                return k.name;
            });
        }

        return result;
    }
}
