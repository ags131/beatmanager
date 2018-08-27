import Vue from 'vue'
import axios from 'axios'
import jszip from 'jszip'
import fs from 'fs'
import path from 'path'
import util from 'util'
import rimraf from 'rimraf'

const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const mkdir = util.promisify(fs.mkdir)
const readdir = util.promisify(fs.readdir)
const rm = util.promisify(rimraf)


export default {
  songs: {},
  beatSaberDir: '',
  get customSongsDir() {
    return path.join(this.beatSaberDir, 'CustomSongs')
  },
  get playlistDir() {
    return path.join(this.beatSaberDir, 'Playlists')
  },
  async songDir(song) {
    const dirname = song.dir || `[${song.key}] ${song.name}`.replace(/[^\w()\[\]_ -]/g, '')
    return path.join(this.customSongsDir, dirname)
  },
  async downloadSong(song) {
    console.log(song)
    const { data } = await axios.get(song.downloadUrl, { 
      responseType: 'arraybuffer' 
    })

    const zip = new jszip()
    await zip.loadAsync(data)
    const [infoFile] = await zip.file(/info\.json$/)
    // const info = JSON.parse(await infoFile.async('string'))
    const zipdir = path.dirname(infoFile.name)
    const dirname = await this.songDir(song)
    try { await mkdir(dirname) } catch(e) { console.error(e) }
    const filesToExtract = []
    zip
      .folder(zipdir)
      .forEach(f => {
        if (!f.includes('/')) {
          filesToExtract.push(f)
        }
      })
    for (const filename of filesToExtract) {
      const data = await zip.folder(zipdir).file(filename).async('arraybuffer')
      await writeFile(path.join(dirname, filename), Buffer.from(data))
    }
    await writeFile(path.join(dirname, 'beatManager.json'), JSON.stringify(song))
  },
  async removeSong (song) {
    const dirname = await this.songDir(song)
    console.log(`rm ${dirname}`)
    await rm(dirname)
  },
  async getSongs () {
    const dirs = await readdir(this.customSongsDir)
    const songs = []
    for (const dir of dirs) {
      const dirname = path.join(this.customSongsDir, dir)
      try {      
        const jsonPath = path.join(dirname, 'beatManager.json')
        const song = JSON.parse(await readFile(jsonPath))
        song.dir = dir
        songs.push(song)
      } catch (e) {
        try {
          console.error(`Cannot load beatManager.json for song: ${dir}`, e)
          const jsonPath = path.join(dirname, 'info.json')
          const song = JSON.parse(await readFile(jsonPath))
          const coverImage = (await readdir(dirname)).find(f => f.toLowerCase() === song.coverImagePath.toLowerCase())
          song.dir = dir
          song.coverUrl = 'data:image/jpeg;base64,' + (await readFile(path.join(dirname, coverImage))).toString('base64')
          song.basic = true
          songs.push(song)
        } catch (e) {
          console.error(`Cannot load info.json for song: ${dir}`, e)
        }
      }
    }
    return songs
  },
  async getPlaylists () {
    const files = await readdir(this.playlistDir)
    const playlists = []
    for (const file of files) {
      if (path.extname(file) !== '.json') continue
      try {
        const filePath = path.join(this.playlistDir, file)
        const playlist = JSON.parse(await readFile(filePath))
        playlist.fileLoc = filePath
        playlists.push(playlist)
      } catch (e) {
        console.error(`Invalid playlist ${file}`)
      }
    }
    return playlists
  },
  async savePlaylist (playlist) {
    await writeFile(playlist.fileLoc, JSON.stringify(playlist))
  },
  async newPlaylist (title, author) {
    const filename = `${title.replace(/[^\w()\[\]_ -]/g, '')}.json`
    const playlist = {
      playlistTitle: title,
      playlistAuthor: author,
      image: '',
      songs: [],
      fileLoc: path.join(this.playlistDir, filename)
    }
    await this.savePlaylist(playlist)
    return playlist
  },
  async playlistAddSong (playlist, song) {
    playlist = Object.assign({}, playlist)
    const key = song.dir
    const songName = `${song.songName} ${song.songSubName}`
    if (!playlist.songs.find(s => s.key === key)) {
      playlist.songs = [...playlist.songs, { key, songName }]
    }
    await this.savePlaylist(playlist)
    return playlist
  },
  async playlistRemoveSong (playlist, song) {
    playlist = Object.assign({}, playlist)
    playlist.songs = playlist.songs.filter(s => s.key !== song.dir)
    await this.savePlaylist(playlist)
    return playlist
  },
  songExists(song) {
    return this.songs.includes(song.key)
  }
}

