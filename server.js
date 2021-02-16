const express = require('express')
const bodyParser = require('body-parser')
const basicAuth = require('basic-auth')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
require('dotenv').config()

var cors = require('cors')
app.use(cors())

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static('public'))

// Setup the Mux SDK
const Mux = require('@mux/mux-node')
const { Video } = new Mux(process.env.MUX_TOKEN_ID, process.env.MUX_TOKEN_SECRET)
let STREAM

// Storage Configuration
const util = require('util')
const fs = require('fs')
const stateFilePath = './.data/stream'
const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)

// Authentication Configuration
const webhookUser = {
    name: 'muxer',
    pass: 'muxology',
}

// Authentication Middleware
const auth = (req, res, next) => {
    function unauthorized(res) {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required')
        return res.sendStatus(401)
    }
    const user = basicAuth(req)
    if (!user || !user.name || !user.pass) {
        return unauthorized(res)
    }
    if (user.name === webhookUser.name && user.pass === webhookUser.pass) {
        return next()
    } else {
        return unauthorized(res)
    }
}

// Creates a new Live Stream - get a Stream Key
const createLiveStream = async () => {
    if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
        console.error("Mux token and/or secret not found")
        return
    }

    return await Video.LiveStreams.create({
        playback_policy: 'public',
        reconnect_window: 10,
        new_asset_settings: { playback_policy: 'public' }
    })
}

const initialize = async () => {
    try {
        const stateFile = await readFile(stateFilePath, 'utf8')
        STREAM = JSON.parse(stateFile)
        console.log('Found an existing stream - Fetching updated data.')
        STREAM = await Video.LiveStreams.get(STREAM.id)
    } catch (err) {
        console.log('No stream found, creating a new one.')
        STREAM = await createLiveStream()
        await writeFile(stateFilePath, JSON.stringify(STREAM))
    }
    return STREAM
}

const getPlaybackId = stream => stream['playback_ids'][0].id

// Gets a trimmed public stream details from a stream for use on the client side
const publicStreamDetails = stream => ({
    status: stream.status,
    playbackId: getPlaybackId(stream),
    recentAssets: stream['recent_asset_ids'],
})

// API for getting the current live stream and its state
app.get('/stream', async (req, res) => {
    const stream = await Video.LiveStreams.get(STREAM.id)
    console.log(`Get Stream - Id: ${STREAM.id}`)
    res.json(
        publicStreamDetails(stream)
    )
})

// API which Returns the 5 most recent VOD assets made from  Live Stream
app.get('/recent', async (req, res) => {

    console.log(`Get recent Vods`)

    const recentAssetIds = STREAM['recent_asset_ids'] || []

    // For each VOD get details from Mux 
    const assets = await Promise.all(
        recentAssetIds
            .reverse()
            .slice(0, 5)
            .map((assetId) =>
                Video.Assets.get(assetId).then(asset => {

                    return {
                        playbackId: getPlaybackId(asset),
                        status: asset.status,
                        createdAt: asset.created_at,
                    }
                })
            )
    )
    res.json(assets)
})

app.post('/temp', async (req, res) => {
    console.log(`temp`)
    res.json('temp')
})

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html')
  })


app.post('/mux-hook', function (req, res) {
    STREAM.status = req.body.data.status
    console.log(`mux hook - status = ${STREAM.status}`)

    switch (req.body.type) {

        // capture asset ID for on-demand copies of live streams
        case 'video.live_stream.idle':
            STREAM['recent_asset_ids'] = req.body.data['recent_asset_ids']

        // Live Stream active or idle - push a new event to frontend
        case 'video.live_stream.active':
            io.emit('stream_update', publicStreamDetails(STREAM))
            break
        default:
        // Relaxing.
    }
    res.status(200).send('Message Received')
})


initialize().then(stream => {
    const listener = http.listen(process.env.PORT || 3000, function () {
        console.log('listening on port ' + listener.address().port)
        console.log(`Stream Key: ${stream.stream_key}`)
    })
})


// io.on('connection', (socket) => {
//     console.log('a user connected')
//     socket.on('disconnect', () => {
//         console.log('user disconnected')
//     })
// })