import { Hono } from 'hono'
import { ImageController } from '../controllers/image.controller'
import { ImageService } from '../services/image.service'
import { ImageMapper } from '../utils/image-mapper';

const imageRoutes = new Hono()
const imageController = new ImageController(new ImageService(new ImageMapper()));

imageRoutes.get('/', (c) => imageController.getImages(c))
imageRoutes.get('/:name', (c) => imageController.getImage(c))
imageRoutes.put('/', (c) => imageController.uploadImage(c))

export default imageRoutes