(function (root, m, Hls, io) {
    const socket = io()

    const Video = {

        src: playbackId => `https://stream.mux.com/${playbackId}.m3u8`,
        poster: playbackId => `https://image.mux.com/${playbackId}/thumbnail.jpg`,

        oncreate: (vnode) => {
            const sourceUrl = Video.src(vnode.attrs.playbackId)
            const video = vnode.dom

            if (Hls.isSupported()) {
                const hls = new Hls()
                hls.loadSource(sourceUrl)
                hls.attachMedia(video)
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.controls = true
                    video.play()
                })

            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = sourceUrl
                video.addEventListener('loadedmetadata', () => {
                    video.controls = true
                    video.play()
                })
            }
        },

        view: (vnode) => {
            return m('video#video', { controls: false, poster: Video.poster(vnode.attrs.playbackId), muted: true })
        }
    }

    const ArchivePreview = () => {
        let hovered = false

        const onHover = () => { hovered = true }
        const offHover = () => { hovered = false }

        const src = (playbackId) =>
            hovered
                ? `https://image.mux.com/${playbackId}/animated.gif`
                : `https://image.mux.com/${playbackId}/thumbnail.jpg`

        return {
            view: (vnode) => {
                return m('img.archivePreview', {
                    onmouseover: onHover,
                    onmouseout: offHover,
                    src: src(vnode.attrs.playbackId)
                })
            }
        }
    }

    // Main Application Component
    const App = {

        stream: {}, 
        recentStreams: [], 

        oninit: async () => {

            await App.getStream()
            App.getRecentStreams()

            socket.on('stream_update', (stream) => {
                if (stream.status === 'idle') {
                    App.getRecentStreams()
                }

                App.stream = stream
                m.redraw()
            })
        },

        getStream: () => {
            m.request({
                method: 'GET',
                url: 'http://localhost:3000/stream',
            })
                .then((result) => {
                    App.stream = result
                })
        },

        getRecentStreams: () => {
            m.request({
                method: 'GET',
                url: 'http://localhost:3000/recent',
            })
                .then((result) => {
                    App.recentStreams = result
                })
        },

        view: () => {
            return [

                m('header', [
                    m('h2', 'Andy Mux Test1'),
                ]),

                m('main', [
                    m('h3', { class: 'title' }, `Status: ${App.stream.status || 'loading...'}`),

                    App.stream.status === 'active'
                        ? m(Video, { playbackId: App.stream.playbackId })
                        : m('.placeholder', 'No active streams'),

                    m('h3', 'Recent Streams'),
                    m('ul.recentStreams', App.recentStreams.map((asset) => (
                        m('li', [
                            m('span.time', (new Date(asset.createdAt * 1000)).toDateString()),
                            m(ArchivePreview, { playbackId: asset.playbackId })
                        ])
                    ))),
                ]),
            ]
        }
    }

    m.mount(root, App)
})(document.body, window.m, window.Hls, window.io)
