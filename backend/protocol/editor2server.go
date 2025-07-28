package protocol

type E2SAddImages struct {
	Uploads [][]byte
}

const E2SAddImagesId = 0

func (packet *E2SAddImages) Unmarshal(reader *PacketReader) error {
	count, err := reader.U8()
	if err != nil {
		return err
	}

	packet.Uploads = make([][]byte, count)
	for i := 0; i < int(count); i++ {
		packet.Uploads[i], err = reader.DynBytes(1024 * 1024 * 10)
		if err != nil {
			return err
		}
	}

	return nil
}

type E2SDeleteImage struct {
	Index uint8
}

const E2SDeleteImageId = 1

func (packet *E2SDeleteImage) Unmarshal(reader *PacketReader) error {
	index, err := reader.U8()
	if err != nil {
		return err
	}

	packet.Index = index
	return nil
}
