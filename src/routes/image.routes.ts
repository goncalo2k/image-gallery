import { Hono } from 'hono'
import type { Bindings, Variables } from '../app';
import { ImageController } from '../controllers/image.controller'
import { ImageService } from '../services/image.service'
import { ImageMapper } from '../utils/image-mapper';

const imageRoutes = new Hono<{ Bindings: Bindings, Variables: Variables }>()
const mapperService = new ImageMapper();
const imageController = new ImageController(new ImageService(mapperService), mapperService);

imageRoutes.get('/audit', (c) => imageController.getImagesAudit(c))
imageRoutes.post('/external', (c) => imageController.uploadExternalSourceImage(c))
imageRoutes.get('/:id', (c) => imageController.getImage(c))
imageRoutes.delete('/:id', (c) => imageController.deleteImage(c))
imageRoutes.get('/', (c) => imageController.getImagesMetada(c))
imageRoutes.post('/', (c) => imageController.uploadImage(c))

export default imageRoutes