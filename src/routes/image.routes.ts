import { Hono } from 'hono'
import { ImageController } from '../controllers/image.controller'
import { ImageService } from '../services/image.service'

const imageRoutes = new Hono()
const imageController = new ImageController(new ImageService());

imageRoutes.get('/', (c) => imageController.getImages(c))
imageRoutes.get('/:name', (c) => imageController.getImage(c))
imageRoutes.post('/', (c) => imageController.uploadImage(c))

export default imageRoutes