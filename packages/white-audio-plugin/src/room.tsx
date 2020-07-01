import * as React from "react";
import {PluginProps} from "white-web-sdk";
import {reaction, IReactionDisposer} from "mobx";
import "./index.less";
import * as mute_icon from "./image/mute_icon.svg";
import * as audio_plugin from "./image/audio_plugin.svg";
import * as delete_icon from "./image/delete_icon.svg";

const timeout = (ms: any) => new Promise(res => setTimeout(res, ms));
import {PluginContext} from "./Plugins";
import {WhiteAudioPluginAttributes} from "./index";

export enum IdentityType {
    host = "host",
    guest = "guest",
    listener = "listener",
}

export type WhiteAudioPluginProps = PluginProps<PluginContext, WhiteAudioPluginAttributes>;


export type WhiteAudioPluginStates = {
    play: boolean;
    mute: boolean;
    selfMute: boolean;
    volume: number;
    seek: number;
    currentTime: number;
};

export type SelfUserInf = {
    identity?: IdentityType,
};

export default class WhiteAudioPluginRoom extends React.Component<WhiteAudioPluginProps, WhiteAudioPluginStates> {

    private readonly reactionPlayDisposer: IReactionDisposer;
    private readonly reactionSeekDisposer: IReactionDisposer;
    private readonly reactionVolumeDisposer: IReactionDisposer;
    private readonly reactionMuteDisposer: IReactionDisposer;
    private readonly reactionSeekTimeDisposer: IReactionDisposer;
    private readonly player: React.RefObject<HTMLVideoElement>;
    private selfUserInf: SelfUserInf | null = null;

    public constructor(props: WhiteAudioPluginProps) {
        super(props);
        this.player = React.createRef();
        this.reactionPlayDisposer = this.startPlayReaction();
        this.reactionSeekDisposer = this.startSeekReaction();
        this.reactionVolumeDisposer = this.startVolumeReaction();
        this.reactionMuteDisposer = this.startMuteTimeReaction();
        this.reactionSeekTimeDisposer = this.startSeekTimeReaction();
        this.state = {
            play: false,
            seek: 0,
            selfMute: false,
            currentTime: 0,
            mute: false,
            volume: 1,
        };
    }

    public componentDidMount(): void {
        this.handleStartCondition()
    }

    private handleStartCondition = (): void => {
        const {plugin} = this.props;
        this.setMyIdentityRoom();
        this.handleNativePlayerState(plugin.attributes.play);
        if (this.player.current) {
            this.player.current.currentTime = plugin.attributes.currentTime;
            this.player.current.addEventListener("play", (event: any) => {
                this.handleRemotePlayState(true);
            });
            this.player.current.addEventListener("pause", (event: any) => {
                this.handleRemotePlayState(false);
                if (this.player.current) {
                    this.player.current.currentTime = plugin.attributes.currentTime;
                }
            });
            this.player.current.addEventListener("seeked", (event: any) => {
                if (this.player.current) {
                    const currentTime = Math.round(plugin.attributes.currentTime);
                    if (plugin.attributes.seek !== currentTime) {
                        this.handleRemoteSeekData(currentTime);
                    }
                }
            });
            this.player.current.addEventListener("volumechange", (event: any) => {
                this.handleRemoteVolumeChange(event.target.volume);
                this.handleRemoteMuteState(event.target.muted);
            });
        }
    }

    private isHost = (): boolean => {
        return !!(this.selfUserInf && this.selfUserInf.identity === IdentityType.host);
    }

    private setMyIdentityRoom = (): void => {
        const {plugin} = this.props;
        if (plugin.context && plugin.context.identity) {
            this.selfUserInf = {
                identity: plugin.context.identity,
            };
        }
    }

    private handleNativePlayerState = async (play: boolean): Promise<void> => {
        if (!this.isHost()) {
            if (play) {
                if (this.player.current) {
                    try {
                        await this.player.current.play();
                    } catch (err) {
                        if (`${err.name}` === "NotAllowedError" || `${err.name}` === "AbortError") {
                            this.setState({selfMute: true});
                            await this.player.current.play();
                        }
                    }
                }
            } else {
                if (this.player.current) {
                    this.player.current.pause();
                }
            }
        }
    }

    private handleRemoteSeekData = (seek: number): void => {
        const {plugin} = this.props;
        if (this.selfUserInf) {
            if (this.selfUserInf.identity === IdentityType.host) {
                plugin.putAttributes({seek: seek});
            }
        }
    }

    private handleRemoteMuteState = (mute: boolean): void => {
        const {plugin} = this.props;
        if (this.selfUserInf) {
            if (this.selfUserInf.identity === IdentityType.host) {
                plugin.putAttributes({mute: mute});
            }
        }
    }

    private handleRemoteVolumeChange = (volume: number): void => {
        const {plugin} = this.props;
        if (this.selfUserInf) {
            if (this.selfUserInf.identity === IdentityType.host) {
                plugin.putAttributes({volume: volume});
            }
        }
    }

    private handleRemotePlayState = (play: boolean): void => {
        const {plugin} = this.props;
        const currentTime = Math.round(plugin.attributes.currentTime);
        if (this.selfUserInf) {
            if (this.selfUserInf.identity === IdentityType.host) {
                plugin.putAttributes({
                    play: play,
                    seek: currentTime,
                    seekTime: Date.now() / 1000,
                });
            }
        }
    }

    private onTimeUpdate = (currentTime: number): void => {
        const {plugin} = this.props;
        if (this.selfUserInf) {
            if (this.selfUserInf.identity === IdentityType.host) {
                plugin.putAttributes({currentTime: currentTime});
            }
        }
    }

    private startPlayReaction(): IReactionDisposer {
        const {plugin} = this.props;
        return reaction(() => {
            return plugin.attributes.play;
        }, async play => {
            this.handleNativePlayerState(play);
        });
    }

    private startSeekTimeReaction(): IReactionDisposer {
        const { plugin } = this.props;
        return reaction(() => {
            return plugin.attributes.seekTime;
        }, seekTime => {
            this.handleSeekReaction(plugin.attributes.seek, seekTime);
        });
    }
    private handleSeekReaction = (seek: number, seekTime?: number): void => {
        if (!this.isHost()) {
            if (this.player.current && seekTime !== undefined) {
                this.player.current.currentTime = seek + (Date.now() / 1000) - seekTime;
            }
        }
    }

    private startSeekReaction(): IReactionDisposer {
        const { plugin } = this.props;
        return reaction(() => {
            return plugin.attributes.seek;
        }, seek => {
            this.handleSeekReaction(seek, plugin.attributes.seekTime);
        });
    }

    private startVolumeReaction(): IReactionDisposer {
        const {plugin} = this.props;
        return reaction(() => {
            return plugin.attributes.volume;
        }, volume => {
            if (!this.isHost()) {
                if (this.player.current) {
                    this.player.current.volume = volume;
                }
            }
        });
    }

    private startMuteTimeReaction(): IReactionDisposer {
        const {plugin} = this.props;
        return reaction(() => {
            return plugin.attributes.mute;
        }, mute => {
            if (!this.isHost()) {
                this.setState({mute: mute});
            }
        });
    }

    public componentWillUnmount(): void {
        this.reactionPlayDisposer();
        this.reactionSeekDisposer();
        this.reactionMuteDisposer();
        this.reactionVolumeDisposer();
    }

    private handleRemove = async (): Promise<void> => {
        const {plugin} = this.props;
        this.handleRemotePlayState(false);
        await timeout(300);
        plugin.remove();
    }
    private timeUpdate = (): void => {
        if (this.player.current) {
            const currentTime = Math.round(this.player.current.currentTime);
            this.onTimeUpdate(currentTime);
        }
    }

    private detectAudioClickEnable = (): any => {
        const {plugin} = this.props;
        if (plugin.context && plugin.context.identity) {
            if (plugin.context.identity !== IdentityType.host) {
                return "none";
            } else {
                return "auto";
            }
        } else {
            return "none";
        }
    }
    private renderMuteBox = (): React.ReactNode => {
        const {plugin} = this.props;
        if (plugin.context && plugin.context.identity) {
            if (plugin.context.identity !== IdentityType.host) {
                if (this.state.selfMute) {
                    return (
                        <div className="media-mute-box">
                            <div onClick={() => {
                                this.setState({selfMute: false});
                            }} onTouchStart={() => {
                                this.setState({selfMute: false});
                            }} style={{pointerEvents: "auto"}} className="media-mute-box-inner">
                                <img src={mute_icon}/>
                                <span>unmute</span>
                            </div>
                        </div>
                    );
                } else {
                    return null;
                }
            } else {
                return null;
            }
        } else {
            return null;
        }
    }

    private renderDeleteBtn = (): React.ReactNode => {
        const {plugin} = this.props;
        if (plugin.context && plugin.context.identity) {
            if (plugin.context.identity === IdentityType.host) {
                return (
                    <div
                        style={{pointerEvents: "auto"}}
                        className="plugin-audio-box-delete"
                        onClick={this.handleRemove}
                    >
                        <img src={delete_icon}/>
                    </div>
                );
            } else {
                return null;
            }
        } else {
            return null;
        }
    }
    
    private renderNavigation = (): React.ReactNode => {
        const { plugin } = this.props;
        if ((plugin.attributes as any).isNavigationDisable === true) {
            return null;
        } else {
            return (
                <div className="plugin-audio-box-nav">
                    <div>
                        <img style={{width: 20, marginLeft: 8}} src={audio_plugin}/>
                        <span>
                            Audio Player
                        </span>
                    </div>
                    {this.renderDeleteBtn()}
                </div>
            );
        }
    }
    public render(): React.ReactNode {
        const {size, plugin, scale} = this.props;
        if ( scale !== 0) {
            return (
                <div className="plugin-audio-box"
                     style={{width: (size.width / scale), height: (size.height / scale), transform: `scale(${scale})`}}>
                    {this.renderNavigation()}
                    <div className="plugin-audio-box-body">
                        {this.renderMuteBox()}
                        <div className="white-plugin-audio-box">
                            <audio
                                className="white-plugin-audio"
                                src={(plugin.attributes as any).pluginAudioUrl}
                                ref={this.player}
                                muted={this.state.mute ? this.state.mute : this.state.selfMute}
                                style={{
                                    width: "100%",
                                    height: 54,
                                    pointerEvents: this.detectAudioClickEnable(),
                                    outline: "none",
                                }}
                                controls
                                controlsList={"nodownload nofullscreen"}
                                onTimeUpdate={this.timeUpdate}
                                preload="auto"
                            />
                        </div>
                    </div>
                </div>
            );
        } else {
            return  null;
        }
    }
}
