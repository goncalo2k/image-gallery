import { Hono } from 'hono'
import { ImageController } from '../controllers/image.controller'
import { ImageService } from '../services/image.service'
import { ImageMapper } from '../utils/image-mapper';

const imageRoutes = new Hono()
const mapperService = new ImageMapper();
const imageController = new ImageController(new ImageService(mapperService), mapperService);

imageRoutes.get('/', (c) => imageController.getImages(c))
imageRoutes.get('/:name', (c) => imageController.getImage(c))
imageRoutes.post('/', (c) => imageController.uploadImage(c))
imageRoutes.post('/external', (c) => imageController.uploadExternalSourceImage(c))
imageRoutes.get('/audit', (c) => imageController.getImagesAudit(c))

export default imageRoutes